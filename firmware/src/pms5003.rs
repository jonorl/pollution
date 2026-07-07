use anyhow::Result;
use serde::Serialize;

#[derive(Serialize, Debug, Clone, Copy)]
pub struct PmReading {
    pub pm1_0: u16,
    pub pm2_5: u16,
    pub pm10: u16,
}

pub struct Pms5003 {
    // Once the CP2102/level-shifter arrives, this will hold
    // the UART driver handle (esp_idf_hal::uart::UartDriver).
}

impl Pms5003 {
    pub fn new() -> Self {
        Self {}
    }

    /// Returns a plausible-looking fake reading.
    /// TODO: replace body with real UART frame read + checksum validation
    /// once hardware arrives. The PMS5003 sends 32-byte frames starting
    /// with header bytes 0x42 0x4D over UART at 9600 baud.
    pub fn read(&mut self) -> Result<PmReading> {
        Ok(PmReading {
            pm1_0: fastrand::u16(5..15),
            pm2_5: fastrand::u16(10..35),
            pm10: fastrand::u16(15..50),
        })
    }
}