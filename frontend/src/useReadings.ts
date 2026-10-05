import { useEffect, useState } from 'react';
import { fetchReadings, type Reading } from './api';

const DAY_MS = 86_400_000;
// The sensor uploads once a minute; polling twice as often keeps "now" at most ~30 s behind.
const POLL_MS = 30_000;

export type FeedStatus = 'loading' | 'ok' | 'error';

export interface Feed {
  /** The last 24 hours, oldest first. */
  readings: Reading[];
  status: FeedStatus;
  /** When the API was last asked, successfully or not. */
  checkedAt: number;
}

export function useReadings(): Feed {
  const [feed, setFeed] = useState<Feed>({ readings: [], status: 'loading', checkedAt: 0 });

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let newest: string | null = null;

    const poll = async () => {
      try {
        // After the first load, only ask for rows newer than the newest one held.
        const since = newest ? new Date(newest) : new Date(Date.now() - DAY_MS);
        const rows = await fetchReadings(since, controller.signal);
        if (rows.length > 0) newest = rows[0].createdAt;
        const cutoff = Date.now() - DAY_MS;
        setFeed((prev) => ({ readings: merge(prev.readings, rows, cutoff), status: 'ok', checkedAt: Date.now() }));
      } catch {
        if (controller.signal.aborted) return;
        setFeed((prev) => ({ ...prev, status: 'error', checkedAt: Date.now() }));
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return feed;
}

function merge(existing: Reading[], incoming: Reading[], cutoff: number): Reading[] {
  // Keep the same array when nothing changed, so the scene isn't rebuilt every poll.
  const oldestExpired = existing.length > 0 && Date.parse(existing[0].createdAt) <= cutoff;
  if (incoming.length === 0 && !oldestExpired) return existing;

  const byId = new Map<number, Reading>();
  for (const reading of existing) byId.set(reading.id, reading);
  for (const reading of incoming) byId.set(reading.id, reading);
  return [...byId.values()]
    .filter((reading) => Date.parse(reading.createdAt) > cutoff)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
