use std::time::Duration;

use anyhow::Result;
use esp_idf_svc::hal::gpio::OutputPin;
use esp_idf_svc::hal::rmt::config::{TransmitConfig, TxChannelConfig};
use esp_idf_svc::hal::rmt::encoder::CopyEncoder;
use esp_idf_svc::hal::rmt::{PinState, Symbol, TxChannelDriver};
use esp_idf_svc::hal::units::Hertz;

const RESOLUTION: Hertz = Hertz(10_000_000);
// Bit timings from the WS2812 datasheet.
const T0H: Duration = Duration::from_nanos(350);
const T0L: Duration = Duration::from_nanos(800);
const T1H: Duration = Duration::from_nanos(700);
const T1L: Duration = Duration::from_nanos(600);
// A bare WS2812 at full power is glaring on a desk; 15% was still too bright in a room.
// Much lower and the dimmest channels round to zero, shifting the hues.
const BRIGHTNESS: f32 = 0.06;

// The same WHO PM2.5 bands and colours as the dashboard (frontend/src/bands.ts).
const BANDS: [(f32, [u8; 3]); 6] = [
    (15.0, [0x5e, 0xea, 0xd4]),
    (25.0, [0xa3, 0xe6, 0x35]),
    (37.5, [0xfa, 0xcc, 0x15]),
    (50.0, [0xfb, 0x92, 0x3c]),
    (75.0, [0xf4, 0x3f, 0x5e]),
    (f32::INFINITY, [0xd9, 0x46, 0xef]),
];

/// The dashboard's colour for a PM2.5 reading in µg/m³.
pub fn band_colour(pm2_5: u16) -> [u8; 3] {
    let value = pm2_5 as f32;
    BANDS.iter().find(|(max, _)| value <= *max).map_or(BANDS[5].1, |(_, rgb)| *rgb)
}

/// The board's single WS2812 RGB LED.
pub struct StatusLed<'d> {
    channel: TxChannelDriver<'d>,
    zero: Symbol,
    one: Symbol,
}

impl<'d> StatusLed<'d> {
    pub fn new(pin: impl OutputPin + 'd) -> Result<Self> {
        let channel = TxChannelDriver::new(pin, &TxChannelConfig { resolution: RESOLUTION, ..Default::default() })?;
        Ok(Self {
            channel,
            zero: Symbol::new_with(RESOLUTION, PinState::High, T0H, PinState::Low, T0L)?,
            one: Symbol::new_with(RESOLUTION, PinState::High, T1H, PinState::Low, T1L)?,
        })
    }

    /// Shows an sRGB colour, as written in CSS, so the LED matches the screen.
    pub fn set(&mut self, rgb: [u8; 3]) -> Result<()> {
        // The LED's light output is linear in its duty cycle, whereas CSS colours are sRGB-encoded;
        // decoding first keeps hues like teal from washing out to green.
        let channel = |c: u8| {
            let s = c as f32 / 255.0;
            let linear = if s <= 0.04045 { s / 12.92 } else { ((s + 0.055) / 1.055).powf(2.4) };
            (linear * BRIGHTNESS * 255.0).round() as u8
        };
        let [r, g, b] = rgb.map(channel);

        // WS2812 expects green, red, blue, most significant bit first.
        let mut symbols = Vec::with_capacity(24);
        for byte in [g, r, b] {
            for bit in (0..8).rev() {
                symbols.push(if (byte >> bit) & 1 == 1 { self.one } else { self.zero });
            }
        }
        self.channel.send_and_wait(CopyEncoder::new()?, &symbols, &TransmitConfig::default())?;
        Ok(())
    }

    pub fn off(&mut self) -> Result<()> {
        self.set([0, 0, 0])
    }
}
