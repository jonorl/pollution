mod pms5003;
mod wifi;

use esp_idf_svc::eventloop::EspSystemEventLoop;
use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::peripherals::Peripherals;   // <-- was hal::prelude, now hal::peripherals
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use esp_idf_svc::wifi::{BlockingWifi, EspWifi};
use log::info;

use pms5003::Pms5003;

#[toml_cfg::toml_config]
pub struct Config {
    #[default("")]
    wifi_ssid: &'static str,
    #[default("")]
    wifi_psk: &'static str,
    #[default("http://localhost:3000/ingest")]
    backend_url: &'static str,
}

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();

    let app_config = CONFIG;

    let peripherals = Peripherals::take()?;
    let sysloop = EspSystemEventLoop::take()?;
    let nvs = EspDefaultNvsPartition::take()?;

    // Construct the wifi driver here, where peripherals.modem is naturally 'static.
    let mut esp_wifi = BlockingWifi::wrap(
        EspWifi::new(peripherals.modem, sysloop.clone(), Some(nvs))?,
        sysloop,
    )?;

    wifi::connect(&mut esp_wifi, app_config.wifi_ssid, app_config.wifi_psk)?;

    let mut sensor = Pms5003::new();

    loop {
        let reading = sensor.read()?;
        info!(
            "PM1.0: {} µg/m³ | PM2.5: {} µg/m³ | PM10: {} µg/m³",
            reading.pm1_0, reading.pm2_5, reading.pm10
        );

        // HTTP POST to backend goes here next.

        FreeRtos::delay_ms(5000);
    }
}