mod backend;
mod led;
mod pms5003;
mod temperature;
mod wifi;

use esp_idf_svc::eventloop::EspSystemEventLoop;
use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::peripherals::Peripherals;   // <-- was hal::prelude, now hal::peripherals
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use esp_idf_svc::wifi::{BlockingWifi, EspWifi};
use log::{info, warn};

use pms5003::{PmReading, Pms5003};

const SAMPLE_INTERVAL_MS: u32 = 5000;
// 12 samples x 5 s: one averaged upload a minute keeps the chart smooth and the table small.
const SAMPLES_PER_UPLOAD: u32 = 12;

#[toml_cfg::toml_config]
pub struct Config {
    #[default("")]
    wifi_ssid: &'static str,
    #[default("")]
    wifi_psk: &'static str,
    #[default("https://pollution.jonathan-orlowski.dev/ingest")]
    backend_url: &'static str,
    #[default("")]
    api_key: &'static str,
    #[default("esp32-01")]
    device_id: &'static str,
    /// "lm35" or "tmp36": they look alike but read differently.
    #[default("tmp36")]
    temp_sensor: &'static str,
}

/// Running sums for one upload window.
#[derive(Default)]
struct Average {
    pm1_0: u32,
    pm2_5: u32,
    pm10: u32,
    counts: [u32; 6],
    count: u32,
    // Kept apart from the PM sums because either sensor can fail without the other.
    temp_sum: f32,
    temp_count: u32,
}

impl Average {
    fn add(&mut self, r: PmReading) {
        self.pm1_0 += r.pm1_0 as u32;
        self.pm2_5 += r.pm2_5 as u32;
        self.pm10 += r.pm10 as u32;
        for (sum, &c) in self.counts.iter_mut().zip(&r.counts) {
            *sum += c as u32;
        }
        self.count += 1;
    }

    fn add_temp(&mut self, celsius: f32) {
        self.temp_sum += celsius;
        self.temp_count += 1;
    }

    /// Rounded PM means and the mean temperature, or None if every PM read in the window failed.
    fn take(&mut self) -> Option<(PmReading, Option<f32>)> {
        let n = std::mem::take(self);
        if n.count == 0 {
            return None;
        }
        let mean = |sum: u32| ((sum + n.count / 2) / n.count) as u16;
        let pm = PmReading {
            pm1_0: mean(n.pm1_0),
            pm2_5: mean(n.pm2_5),
            pm10: mean(n.pm10),
            counts: n.counts.map(mean),
        };
        let temperature = (n.temp_count > 0).then(|| n.temp_sum / n.temp_count as f32);
        Some((pm, temperature))
    }
}

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();

    let app_config = CONFIG;
    if app_config.api_key.is_empty() {
        warn!("api_key is empty in cfg.toml; the backend will reject every upload");
    }

    let peripherals = Peripherals::take()?;
    let sysloop = EspSystemEventLoop::take()?;
    let nvs = EspDefaultNvsPartition::take()?;

    // Construct the wifi driver here, where peripherals.modem is naturally 'static.
    let mut esp_wifi = BlockingWifi::wrap(
        EspWifi::new(peripherals.modem, sysloop.clone(), Some(nvs))?,
        sysloop,
    )?;

    // Readings are still worth logging without a network, so a WiFi failure
    // shouldn't stop the sensor loop.
    if let Err(e) = wifi::connect(&mut esp_wifi, app_config.wifi_ssid, app_config.wifi_psk) {
        warn!("WiFi unavailable, continuing offline: {e:#}");
    }

    // GPIO17 -> sensor RXD, GPIO18 <- sensor TXD (UART1, routed via the GPIO matrix).
    let mut sensor = Pms5003::new(
        peripherals.uart1,
        peripherals.pins.gpio17,
        peripherals.pins.gpio18,
    )?;

    // The on-board RGB LED (GPIO48) mirrors the dashboard's colour for the latest reading.
    // It's a nicety, so the device carries on without it if the driver can't start.
    let mut led = led::StatusLed::new(peripherals.pins.gpio48)
        .inspect_err(|e| warn!("Status LED unavailable: {e:#}"))
        .ok();

    // LM35/TMP36 output on GPIO10 (ADC1). Optional like the LED: PM readings carry on without it.
    let mut thermometer = temperature::Kind::from_config(app_config.temp_sensor)
        .and_then(|kind| temperature::TempSensor::new(peripherals.adc1, peripherals.pins.gpio10, kind))
        .inspect_err(|e| warn!("Temperature sensor unavailable: {e:#}"))
        .ok();

    let mut window = Average::default();
    let mut ticks = 0;

    loop {
        // A single bad frame shouldn't stop the device; log it and try again next cycle.
        match sensor.read() {
            Ok(reading) => {
                info!(
                    "PM1.0: {} µg/m³ | PM2.5: {} µg/m³ | PM10: {} µg/m³ | ≥0.3 µm: {}/0.1 L",
                    reading.pm1_0, reading.pm2_5, reading.pm10, reading.counts[0]
                );
                window.add(reading);
                if let Some(led) = led.as_mut() {
                    if let Err(e) = led.set(led::band_colour(reading.pm2_5)) {
                        warn!("Status LED update failed: {e:#}");
                    }
                }
            }
            Err(e) => {
                warn!("PMS5003 read failed: {e:#}");
                // Dark means no current reading, rather than showing a stale colour.
                if let Some(led) = led.as_mut() {
                    let _ = led.off();
                }
            }
        }

        if let Some(sensor) = thermometer.as_mut() {
            match sensor.read() {
                Ok(t) => {
                    info!("Temperature: {:.1} °C ({:.0} mV)", t.celsius, t.millivolts);
                    window.add_temp(t.celsius);
                }
                Err(e) => warn!("Temperature read failed: {e:#}"),
            }
        }

        ticks += 1;
        if ticks >= SAMPLES_PER_UPLOAD {
            ticks = 0;
            if let Some((avg, temperature)) = window.take() {
                upload(&mut esp_wifi, &app_config, avg, temperature);
            }
        }

        FreeRtos::delay_ms(SAMPLE_INTERVAL_MS);
    }
}

/// Failed uploads are logged and dropped: a missing minute on the chart is
/// better than a backlog the device has no storage for.
fn upload(wifi: &mut BlockingWifi<EspWifi<'static>>, config: &Config, avg: PmReading, temperature: Option<f32>) {
    if let Err(e) = wifi::ensure_connected(wifi) {
        warn!("Skipping upload, WiFi down: {e:#}");
        return;
    }
    match backend::post_reading(config.backend_url, config.api_key, config.device_id, avg, temperature) {
        Ok(()) => info!(
            "Uploaded 1-min average: PM1.0 {} | PM2.5 {} | PM10 {} | {}",
            avg.pm1_0,
            avg.pm2_5,
            avg.pm10,
            temperature.map_or("no temperature".into(), |t| format!("{t:.1} °C"))
        ),
        Err(e) => warn!("Upload failed: {e:#}"),
    }
}
