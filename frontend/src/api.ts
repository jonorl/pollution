export interface Reading {
  id: number;
  deviceId: string;
  pm1_0: number;
  pm2_5: number;
  pm10: number;
  /** Particles per 0.1 L at or above 0.3, 0.5, 1.0, 2.5, 5.0 and 10 µm; null on older rows. */
  n0_3?: number | null;
  n0_5?: number | null;
  n1_0?: number | null;
  n2_5?: number | null;
  n5_0?: number | null;
  n10?: number | null;
  createdAt: string;
}

/** Mean readings over one time bucket starting at `t`; `n` is the minutes recorded in it. */
export interface Bin {
  t: string;
  pm1: number;
  pm25: number;
  pm10: number;
  n: number;
}

/** Mean readings over one local calendar day (YYYY-MM-DD); `n` is the minutes recorded that day. */
export interface DailyMean {
  day: string;
  pm1: number;
  pm25: number;
  pm10: number;
  n: number;
}

// Defaults to production so `npm run dev` shows live data; set VITE_API_URL to point elsewhere.
const API_URL: string = import.meta.env.VITE_API_URL ?? 'https://pollution.jonathan-orlowski.dev';

async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, API_URL || window.location.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API replied ${res.status}`);
  return (await res.json()) as T;
}

/** Readings created strictly after `since`, newest first. */
export const fetchReadings = (since: Date, signal?: AbortSignal) =>
  getJson<Reading[]>('/readings', { since: since.toISOString(), limit: '2000' }, signal);

export const fetchBins = (signal?: AbortSignal) =>
  getJson<Bin[]>('/readings/bins', { days: '14', minutes: '5' }, signal);

export const fetchDaily = (signal?: AbortSignal) =>
  getJson<DailyMean[]>(
    '/readings/daily',
    { days: '182', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    signal,
  );
