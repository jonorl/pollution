export interface Band {
  /** Inclusive upper bound, µg/m³ of PM2.5. */
  max: number;
  /** Name in the legend. */
  name: string;
  /** Status shown next to a reading in this band. */
  label: string;
  range: string;
  color: string;
}

export const WHO_GUIDELINE_24H = 15;

// WHO 2021 air quality guideline and interim targets 4 → 1 for 24-hour mean PM2.5.
export const BANDS: readonly Band[] = [
  { max: 15, name: 'WHO guideline', label: 'Within WHO guideline', range: '0–15', color: '#5eead4' },
  { max: 25, name: 'Interim target 4', label: 'Above WHO guideline', range: '15–25', color: '#a3e635' },
  { max: 37.5, name: 'Interim target 3', label: 'Above WHO guideline', range: '25–37.5', color: '#facc15' },
  { max: 50, name: 'Interim target 2', label: 'Well above WHO guideline', range: '37.5–50', color: '#fb923c' },
  { max: 75, name: 'Interim target 1', label: 'Well above WHO guideline', range: '50–75', color: '#f43f5e' },
  { max: Infinity, name: 'Beyond all targets', label: 'Beyond every WHO target', range: '75+', color: '#d946ef' },
];

export function bandFor(pm25: number): Band {
  return BANDS.find((band) => pm25 <= band.max) ?? BANDS[BANDS.length - 1];
}
