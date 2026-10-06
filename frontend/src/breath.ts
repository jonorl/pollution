import type { Reading } from './api';

/** One relaxed breath. */
export const BREATH_LITRES = 0.5;
// The sensor counts particles in 0.1 L samples.
const SAMPLE_LITRES = 0.1;
// Rough particles ≥0.3 µm per 0.1 L for each µg/m³ of PM2.5. Only used for rows from before
// the firmware sent its own counts.
const ESTIMATE_PER_UG = 160;
// Typical indoor shares of particles ≥0.3 µm that are also ≥0.5, ≥1, ≥2.5, ≥5 and ≥10 µm.
const TYPICAL_SHARES = [0.3, 0.055, 0.006, 0.0018, 0.0004];

/** The size thresholds `shares` refers to, in µm. */
export const SIZE_THRESHOLDS = ['0.5', '1', '2.5', '5', '10'] as const;

/** Most dots the breath view draws; phones get fewer. */
export const MAX_DOTS = { fine: 64000, coarse: 24000 };

/** How many particles each dot stands for once a breath holds more than can be drawn. */
export function particlesPerDot(total: number, coarsePointer: boolean): number {
  const max = coarsePointer ? MAX_DOTS.coarse : MAX_DOTS.fine;
  return Math.max(1, Math.ceil(total / max));
}

export interface BreathCounts {
  /** Particles ≥0.3 µm in one breath. */
  total: number;
  /** Fractions of `total` at or above 0.5, 1, 2.5, 5 and 10 µm. */
  shares: number[];
  /** False when estimated from PM2.5 because the reading has no counts. */
  measured: boolean;
}

export function breathCounts(reading: Reading | null): BreathCounts | null {
  if (!reading) return null;
  const perBreath = BREATH_LITRES / SAMPLE_LITRES;

  if (reading.n0_3 != null) {
    const base = reading.n0_3;
    const larger = [reading.n0_5, reading.n1_0, reading.n2_5, reading.n5_0, reading.n10];
    return {
      total: base * perBreath,
      shares: larger.map((count) => (base > 0 ? (count ?? 0) / base : 0)),
      measured: true,
    };
  }
  return { total: reading.pm2_5 * ESTIMATE_PER_UG * perBreath, shares: TYPICAL_SHARES, measured: false };
}
