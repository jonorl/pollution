use anyhow::Result;
use esp_idf_svc::wifi::{AuthMethod, BlockingWifi, ClientConfiguration, Configuration, EspWifi};
use log::info;

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
    info!("WiFi started, connecting to '{ssid}'...");
    wifi.connect()?;
    wifi.wait_netif_up()?;

    let ip_info = wifi.wifi().sta_netif().get_ip_info()?;
    info!("WiFi connected. IP: {:?}", ip_info.ip);

    Ok(())
}