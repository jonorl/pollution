mod backend;
mod pms5003;
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
}

/// Running sums for one upload window.
#[derive(Default)]
struct Average {
    pm1_0: u32,
    pm2_5: u32,
    pm10: u32,
    count: u32,
}

impl Average {
    fn add(&mut self, r: PmReading) {
        self.pm1_0 += r.pm1_0 as u32;
        self.pm2_5 += r.pm2_5 as u32;
        self.pm10 += r.pm10 as u32;
        self.count += 1;
    }

    /// Rounded mean, or None if every read in the window failed.
    fn take(&mut self) -> Option<PmReading> {
        let n = std::mem::take(self);
        if n.count == 0 {
            return None;
        }
        let mean = |sum: u32| ((sum + n.count / 2) / n.count) as u16;
        Some(PmReading {
            pm1_0: mean(n.pm1_0),
            pm2_5: mean(n.pm2_5),
            pm10: mean(n.pm10),
        })
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

    let mut window = Average::default();
    let mut ticks = 0;

    loop {
        // A single bad frame shouldn't stop the device; log it and try again next cycle.
        match sensor.read() {
            Ok(reading) => {
                info!(
                    "PM1.0: {} µg/m³ | PM2.5: {} µg/m³ | PM10: {} µg/m³",
                    reading.pm1_0, reading.pm2_5, reading.pm10
                );
                window.add(reading);
            }
            Err(e) => warn!("PMS5003 read failed: {e:#}"),
        }

        ticks += 1;
        if ticks >= SAMPLES_PER_UPLOAD {
            ticks = 0;
            if let Some(avg) = window.take() {
                upload(&mut esp_wifi, &app_config, avg);
            }
        }

        FreeRtos::delay_ms(SAMPLE_INTERVAL_MS);
    }
}

/// Failed uploads are logged and dropped: a missing minute on the chart is
/// better than a backlog the device has no storage for.
fn upload(wifi: &mut BlockingWifi<EspWifi<'static>>, config: &Config, avg: PmReading) {
    if let Err(e) = wifi::ensure_connected(wifi) {
        warn!("Skipping upload, WiFi down: {e:#}");
        return;
    }
    match backend::post_reading(config.backend_url, config.api_key, config.device_id, avg) {
        Ok(()) => info!(
            "Uploaded 1-min average: PM1.0 {} | PM2.5 {} | PM10 {}",
            avg.pm1_0, avg.pm2_5, avg.pm10
        ),
        Err(e) => warn!("Upload failed: {e:#}"),
    }
}
