import { getCalendars } from 'expo-localization';

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
  /** °C from the board's TMP36; null on rows from before it was fitted. */
  temperature_c?: number | null;
  createdAt: string;
}

/** Mean readings over one time bucket starting at `t`; `n` is the minutes recorded in it. */
export interface Bin {
  t: string;
  pm1: number;
  pm25: number;
  pm10: number;
  /** Mean °C; null when nothing in the bucket had a temperature. */
  temp?: number | null;
  n: number;
}

/** Mean readings over one local calendar day (YYYY-MM-DD); `n` is the minutes recorded that day. */
export interface DailyMean {
  day: string;
  pm1: number;
  pm25: number;
  pm10: number;
  /** Mean °C; null when nothing that day had a temperature. */
  temp?: number | null;
  n: number;
}

// Defaults to production so a development build shows live data; set EXPO_PUBLIC_API_URL to point elsewhere.
const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'https://pollution.jonathan-orlowski.dev';
// A phone's connection can stall without ever failing, which would hold up every later poll.
const TIMEOUT_MS = 20_000;

async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}?${query}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`API replied ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Readings created strictly after `since`, newest first. */
export const fetchReadings = (since: Date, signal?: AbortSignal) =>
  getJson<Reading[]>('/readings', { since: since.toISOString(), limit: '2000' }, signal);

export const fetchBins = (signal?: AbortSignal) =>
  getJson<Bin[]>('/readings/bins', { days: '14', minutes: '5' }, signal);

export const fetchDaily = (signal?: AbortSignal) =>
  getJson<DailyMean[]>('/readings/daily', { days: '182', tz: getCalendars()[0]?.timeZone ?? 'UTC' }, signal);
