# Firmware

Rust on ESP-IDF for the ESP32-S3. It reads the PMS5003 and the DHT22 every 5 seconds and posts a one-minute average to the API. Wiring, setup and flashing are in the [main README](../README.md#firmware).

| File | What it does |
| --- | --- |
| [`src/main.rs`](src/main.rs) | Config, the sampling loop and the one-minute average |
| [`src/pms5003.rs`](src/pms5003.rs) | Reads PMS5003 frames over UART and checks their checksums |
| [`src/dht22.rs`](src/dht22.rs) | Times the DHT22's one-wire protocol bit by bit |
| [`src/wifi.rs`](src/wifi.rs) | Connects to Wi-Fi and reconnects when the link drops |
| [`src/backend.rs`](src/backend.rs) | Posts readings to `/ingest` over HTTPS |
| [`src/led.rs`](src/led.rs) | Shows the WHO band's colour on the board's RGB LED |

## Dev container

[`.devcontainer/`](.devcontainer) builds an image with the `esp` toolchain, `espflash` and `ldproxy` already installed, for VS Code or GitHub Codespaces. Inside it, `scripts/build.sh` and `scripts/flash.sh` build and flash (`release` by default, or pass `debug`).
