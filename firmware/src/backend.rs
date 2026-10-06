use std::time::Duration;

use anyhow::{bail, Result};
use embedded_svc::http::client::Client;
use embedded_svc::io::Write;
use esp_idf_svc::http::client::{Configuration, EspHttpConnection};
use serde::Serialize;

use crate::pms5003::PmReading;

#[derive(Serialize)]
struct IngestBody<'a> {
    #[serde(rename = "deviceId")]
    device_id: &'a str,
    pm1_0: u16,
    pm2_5: u16,
    pm10: u16,
    // Particles per 0.1 L at or above each size; names match the backend's columns.
    n0_3: u16,
    n0_5: u16,
    n1_0: u16,
    n2_5: u16,
    n5_0: u16,
    n10: u16,
    /// Mean over the minute, to 0.1 °C; left out entirely when the sensor gave nothing.
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature_c: Option<f32>,
}

/// POSTs one reading to the backend's /ingest route.
pub fn post_reading(
    url: &str,
    api_key: &str,
    device_id: &str,
    reading: PmReading,
    temperature_c: Option<f32>,
) -> Result<()> {
    let body = serde_json::to_vec(&IngestBody {
        device_id,
        pm1_0: reading.pm1_0,
        pm2_5: reading.pm2_5,
        pm10: reading.pm10,
        n0_3: reading.counts[0],
        n0_5: reading.counts[1],
        n1_0: reading.counts[2],
        n2_5: reading.counts[3],
        n5_0: reading.counts[4],
        n10: reading.counts[5],
        temperature_c: temperature_c.map(|t| (t * 10.0).round() / 10.0),
    })?;

    let connection = EspHttpConnection::new(&Configuration {
        timeout: Some(Duration::from_secs(10)),
        // ESP-IDF's bundled root CAs, so HTTPS works without pinning the server's certificate.
        crt_bundle_attach: Some(esp_idf_svc::sys::esp_crt_bundle_attach),
        ..Default::default()
    })?;
    let mut client = Client::wrap(connection);

    let content_length = body.len().to_string();
    let headers = [
        ("content-type", "application/json"),
        ("content-length", content_length.as_str()),
        ("x-api-key", api_key),
    ];

    let mut request = client.post(url, &headers)?;
    request.write_all(&body)?;
    request.flush()?;
    let response = request.submit()?;

    match response.status() {
        201 => Ok(()),
        401 => bail!("backend rejected the API key (401)"),
        status => bail!("backend replied {status}"),
    }
}
