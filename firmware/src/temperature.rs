use anyhow::{bail, Result};
use esp_idf_svc::hal::adc::attenuation::DB_2_5;
use esp_idf_svc::hal::adc::oneshot::config::{AdcChannelConfig, Calibration};
use esp_idf_svc::hal::adc::oneshot::{AdcChannelDriver, AdcDriver};
use esp_idf_svc::hal::adc::{Adc, AdcChannel};
use esp_idf_svc::hal::gpio::ADCPin;

// The analogue output wanders by a few millivolts (≈0.5 °C) between conversions, so each
// reading averages a burst of them.
const SAMPLES: u32 = 32;

/// The analogue sensors this reads. Both give 10 mV per °C; the TMP36 adds 500 mV so it can go below 0 °C.
#[derive(Clone, Copy, Debug)]
pub enum Kind {
    Lm35,
    Tmp36,
}

impl Kind {
    pub fn from_config(name: &str) -> Result<Self> {
        match name.to_ascii_lowercase().as_str() {
            "lm35" => Ok(Self::Lm35),
            "tmp36" => Ok(Self::Tmp36),
            other => bail!("unknown temp_sensor {other:?} in cfg.toml; expected \"lm35\" or \"tmp36\""),
        }
    }

    fn offset_mv(self) -> f32 {
        match self {
            Self::Lm35 => 0.0,
            Self::Tmp36 => 500.0,
        }
    }
}

pub struct TempReading {
    pub celsius: f32,
    /// The raw output, logged so the sensor type can be checked: at room temperature an LM35
    /// gives roughly 200–300 mV and a TMP36 roughly 700–800 mV.
    pub millivolts: f32,
}

pub struct TempSensor<'d, C: AdcChannel> {
    channel: AdcChannelDriver<'d, C, AdcDriver<'d, C::AdcUnit>>,
    kind: Kind,
}

impl<'d, C: AdcChannel> TempSensor<'d, C> {
    pub fn new<A: Adc<AdcUnit = C::AdcUnit> + 'd>(adc: A, pin: impl ADCPin<AdcChannel = C> + 'd, kind: Kind) -> Result<Self> {
        let config = AdcChannelConfig {
            // 2.5 dB covers 0–1.25 V: up to 125 °C on an LM35 and 75 °C on a TMP36, with finer
            // steps than the wider ranges would give.
            attenuation: DB_2_5,
            // Corrects each chip's ADC against its factory calibration, so the result is in real millivolts.
            calibration: Calibration::Curve,
            ..Default::default()
        };
        let channel = AdcChannelDriver::new(AdcDriver::new(adc)?, pin, &config)?;
        Ok(Self { channel, kind })
    }

    pub fn read(&mut self) -> Result<TempReading> {
        let mut sum = 0u32;
        for _ in 0..SAMPLES {
            sum += self.channel.read()? as u32;
        }
        let millivolts = sum as f32 / SAMPLES as f32;
        Ok(TempReading {
            celsius: (millivolts - self.kind.offset_mv()) / 10.0,
            millivolts,
        })
    }
}
