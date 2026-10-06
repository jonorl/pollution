export type BandKey = 'good' | 'moderate' | 'elevated' | 'high' | 'veryHigh' | 'extreme';

export interface Band {
  key: BandKey;
  /** Inclusive upper bound, µg/m³ of PM2.5. */
  max: number;
  color: string;
}

export const WHO_GUIDELINE_24H = 15;

// Thresholds are WHO's 2021 24-hour guideline for PM2.5 (15) and its interim targets 4 → 1
// (25, 37.5, 50, 75). Names live in strings.ts; the firmware's LED copies these colours.
export const BANDS: readonly Band[] = [
  { key: 'good', max: 15, color: '#5eead4' },
  { key: 'moderate', max: 25, color: '#a3e635' },
  { key: 'elevated', max: 37.5, color: '#facc15' },
  { key: 'high', max: 50, color: '#fb923c' },
  { key: 'veryHigh', max: 75, color: '#f43f5e' },
  { key: 'extreme', max: Infinity, color: '#d946ef' },
];

export function bandFor(pm25: number): Band {
  return BANDS.find((band) => pm25 <= band.max) ?? BANDS[BANDS.length - 1];
}
