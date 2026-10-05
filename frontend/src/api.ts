export interface Reading {
  id: number;
  deviceId: string;
  pm1_0: number;
  pm2_5: number;
  pm10: number;
  createdAt: string;
}

// Defaults to production so `npm run dev` shows live data; set VITE_API_URL to point elsewhere.
const API_URL: string = import.meta.env.VITE_API_URL ?? 'https://pollution.jonathan-orlowski.dev';

/** Readings created strictly after `since`, newest first. */
export async function fetchReadings(since: Date, signal?: AbortSignal): Promise<Reading[]> {
  const url = new URL('/readings', API_URL || window.location.origin);
  url.searchParams.set('since', since.toISOString());
  url.searchParams.set('limit', '2000');

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API replied ${res.status}`);
  return (await res.json()) as Reading[];
}
