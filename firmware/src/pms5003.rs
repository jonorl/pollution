use std::time::Duration;

use anyhow::{bail, Result};
use esp_idf_svc::hal::delay::TickType;
use esp_idf_svc::hal::gpio::{InputPin, OutputPin};
use esp_idf_svc::hal::uart::{config, Uart, UartDriver};
use esp_idf_svc::hal::units::Hertz;
use esp_idf_svc::sys::ESP_ERR_TIMEOUT;
use serde::Serialize;

const FRAME_LEN: usize = 32;
const HEADER: [u8; 2] = [0x42, 0x4D];
// The sensor sends a frame roughly every second, so 2.5 s of silence means
// nothing is arriving at all (usually TXD not reaching the RX pin).
const READ_TIMEOUT: Duration = Duration::from_millis(2500);

#[derive(Serialize, Debug, Clone, Copy)]
pub struct PmReading {
    pub pm1_0: u16,
    pub pm2_5: u16,
    pub pm10: u16,
}

pub struct Pms5003<'d> {
    uart: UartDriver<'d>,
}

impl<'d> Pms5003<'d> {
    pub fn new(
        uart: impl Uart + 'd,
        tx: impl OutputPin + 'd,
        rx: impl InputPin + 'd,
    ) -> Result<Self> {
        let config = config::Config::new().baudrate(Hertz(9600));
        let uart = UartDriver::new(
            uart,
            tx,
            rx,
            Option::<esp_idf_svc::hal::gpio::AnyIOPin>::None,
            Option::<esp_idf_svc::hal::gpio::AnyIOPin>::None,
            &config,
        )?;
        Ok(Self { uart })
    }

    pub fn read(&mut self) -> Result<PmReading> {
        // Frames queue up while the main loop sleeps; drop them so we report
        // what the air is like now, not several seconds ago.
        self.uart.clear_rx()?;

        let mut frame = [0u8; FRAME_LEN];
        self.sync_to_header()?;
        frame[..2].copy_from_slice(&HEADER);
        self.read_exact(&mut frame[2..])?;

        let word = |i: usize| u16::from_be_bytes([frame[i], frame[i + 1]]);

        if word(2) != 28 {
            bail!("unexpected PMS5003 frame length {}", word(2));
        }
        let sum: u16 = frame[..30].iter().map(|&b| b as u16).sum();
        if sum != word(30) {
            bail!("PMS5003 checksum mismatch ({sum} != {})", word(30));
        }

        // Bytes 10–15 are the "atmospheric environment" values; 4–9 are the
        // CF=1 factory-calibration values, which overread in ambient air.
        Ok(PmReading {
            pm1_0: word(10),
            pm2_5: word(12),
            pm10: word(14),
        })
    }

    fn sync_to_header(&self) -> Result<()> {
        let mut byte = [0u8; 1];
        let mut prev = 0u8;
        // Bounded so a noisy line produces an error rather than a hang.
        for _ in 0..FRAME_LEN * 3 {
            self.read_exact(&mut byte)?;
            if prev == HEADER[0] && byte[0] == HEADER[1] {
                return Ok(());
            }
            prev = byte[0];
        }
        bail!("no PMS5003 frame header found in {} bytes", FRAME_LEN * 3)
    }

    fn read_exact(&self, buf: &mut [u8]) -> Result<()> {
        let timeout = TickType::from(READ_TIMEOUT).0;
        let mut filled = 0;
        while filled < buf.len() {
            // The driver reports silence as either a zero-length read or ESP_ERR_TIMEOUT.
            let n = match self.uart.read(&mut buf[filled..], timeout) {
                Err(e) if e.code() == ESP_ERR_TIMEOUT as i32 => 0,
                other => other?,
            };
            if n == 0 {
                bail!("timed out waiting for PMS5003 data; check sensor TXD -> GPIO18");
            }
            filled += n;
        }
        Ok(())
    }
}
