use anyhow::{bail, Result};
use esp_idf_svc::hal::delay::Ets;
use esp_idf_svc::hal::gpio::{InputOutput, InputPin, OutputPin, PinDriver, Pull};
use esp_idf_svc::hal::interrupt;
use esp_idf_svc::sys::esp_timer_get_time;
use log::warn;

// A bit is a 1 when the sensor holds the line high for ~70 µs and a 0 for ~27 µs; this splits them.
const ONE_THRESHOLD_US: i64 = 48;

pub struct Climate {
    pub celsius: f32,
    /// Relative humidity, %.
    pub humidity: f32,
}

/// The DHT22 (AM2302) on a single data line, which it and the ESP32 take turns pulling low.
/// It needs at least 2 s between reads; the main loop reads every 5.
pub struct Dht22<'d> {
    pin: PinDriver<'d, InputOutput>,
}

impl<'d> Dht22<'d> {
    pub fn new(pin: impl InputPin + OutputPin + 'd) -> Result<Self> {
        // Open drain, so neither side ever drives the line high against the other. The module's
        // own resistor does the pulling up; the internal one helps on a bare sensor.
        let mut pin = PinDriver::input_output_od(pin, Pull::Up)?;
        pin.set_high()?;
        Ok(Self { pin })
    }

    pub fn read(&mut self) -> Result<Climate> {
        // Start signal: hold the line low for over a millisecond, then let it go.
        self.pin.set_low()?;
        Ets::delay_us(1_200);

        let mut data = [0u8; 5];
        // How long each bit's high lasted, in µs, for the log when a frame makes no sense.
        let mut highs = [0u8; 40];
        let pin = &mut self.pin;
        // The whole exchange takes ~5 ms and every bit is told apart by tens of microseconds, so it
        // runs with this core's interrupts off; a Wi-Fi interrupt mid-bit would otherwise corrupt it.
        let exchange = interrupt::free(|| -> Result<(), &'static str> {
            pin.set_high().map_err(|_| "couldn't release the line")?;
            // The sensor answers by pulling low for ~80 µs, then high for ~80 µs, then starts bit one.
            wait_for(pin, false, 100).ok_or("no response; check the wiring")?;
            wait_for(pin, true, 100).ok_or("response cut short")?;
            wait_for(pin, false, 100).ok_or("response cut short")?;
            for bit in 0..40 {
                // Each bit opens with ~50 µs low; its value is in how long the high that follows lasts.
                wait_for(pin, true, 80).ok_or("data cut short")?;
                let high_us = wait_for(pin, false, 100).ok_or("data cut short")?;
                highs[bit] = high_us.min(255) as u8;
                if high_us > ONE_THRESHOLD_US {
                    data[bit / 8] |= 0x80 >> (bit % 8);
                }
            }
            Ok(())
        });
        if let Err(reason) = exchange {
            bail!("DHT22 {reason}");
        }

        let sum = data[..4].iter().fold(0u8, |sum, &b| sum.wrapping_add(b));
        let frame = || warn!("DHT22 frame {data:02X?}, bit highs (µs) {highs:?}");
        if sum != data[4] {
            frame();
            bail!("DHT22 checksum mismatch");
        }
        let humidity = u16::from_be_bytes([data[0], data[1]]) as f32 / 10.0;
        // Temperature is sign and magnitude, not two's complement: the top bit marks below zero.
        let magnitude = u16::from_be_bytes([data[2] & 0x7f, data[3]]) as f32 / 10.0;
        let celsius = if data[2] & 0x80 != 0 { -magnitude } else { magnitude };

        // An all-zero frame passes the checksum, and a loose wire can produce one.
        if humidity == 0.0 && celsius == 0.0 || !(0.0..=100.0).contains(&humidity) || !(-40.0..=80.0).contains(&celsius) {
            frame();
            bail!("DHT22 gave an impossible reading ({celsius:.1} °C, {humidity:.1} %)");
        }
        Ok(Climate { celsius, humidity })
    }
}

/// Waits for the line to read `high`, returning how many µs that took, or None after `timeout_us`.
fn wait_for(pin: &PinDriver<'_, InputOutput>, high: bool, timeout_us: i64) -> Option<i64> {
    // SAFETY: esp_timer_get_time only reads the system timer, which keeps counting with interrupts off.
    let start = unsafe { esp_timer_get_time() };
    loop {
        let elapsed = unsafe { esp_timer_get_time() } - start;
        if pin.is_high() == high {
            return Some(elapsed);
        }
        if elapsed > timeout_us {
            return None;
        }
    }
}
