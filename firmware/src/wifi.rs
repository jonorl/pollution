use anyhow::Result;
use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::sys::{esp, esp_wifi_set_ps, wifi_ps_type_t_WIFI_PS_NONE};
use esp_idf_svc::wifi::{AuthMethod, BlockingWifi, ClientConfiguration, Configuration, EspWifi};
use log::{info, warn};

const CONNECT_ATTEMPTS: u32 = 5;
const RETRY_DELAY_MS: u32 = 3000;

/// Configures and connects an already-constructed BlockingWifi handle.
/// We take a mutable reference rather than owning it — main.rs owns the
/// wifi driver for the lifetime of the program, this function just drives
/// it through the connect sequence.
pub fn connect(
    wifi: &mut BlockingWifi<EspWifi<'static>>,
    ssid: &str,
    password: &str,
) -> Result<()> {
    wifi.set_configuration(&Configuration::Client(ClientConfiguration {
        ssid: ssid.try_into().unwrap(),
        password: password.try_into().unwrap(),
        auth_method: AuthMethod::WPA2Personal,
        ..Default::default()
    }))?;

    wifi.start()?;
    // Modem sleep makes the station miss beacons when the AP switches channel,
    // which drops the connection; the device is mains-powered so it isn't needed.
    esp!(unsafe { esp_wifi_set_ps(wifi_ps_type_t_WIFI_PS_NONE) })?;
    info!("WiFi started, connecting to '{ssid}'...");

    let mut attempt = 1;
    loop {
        match try_connect(wifi) {
            Ok(()) => break,
            Err(e) if attempt < CONNECT_ATTEMPTS => {
                warn!("WiFi attempt {attempt}/{CONNECT_ATTEMPTS} failed: {e}; retrying");
                let _ = wifi.disconnect();
                FreeRtos::delay_ms(RETRY_DELAY_MS);
                attempt += 1;
            }
            Err(e) => return Err(e),
        }
    }

    let ip_info = wifi.wifi().sta_netif().get_ip_info()?;
    info!("WiFi connected. IP: {:?}", ip_info.ip);

    Ok(())
}

fn try_connect(wifi: &mut BlockingWifi<EspWifi<'static>>) -> Result<()> {
    wifi.connect()?;
    wifi.wait_netif_up()?;
    Ok(())
}
