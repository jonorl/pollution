import { useEffect, useState } from 'react';

export interface Polled<T> {
  /** The last good response; kept through failures and while polling is paused. */
  data: T | null;
  failed: boolean;
}

/** Fetches `load` now and every `intervalMs` while `enabled`, e.g. only while its view is on screen. */
export function usePolled<T>(enabled: boolean, intervalMs: number, load: (signal: AbortSignal) => Promise<T>): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ data: null, failed: false });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: number | undefined;

    const run = async () => {
      try {
        const data = await load(controller.signal);
        setState({ data, failed: false });
      } catch {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, failed: true }));
      }
      if (!controller.signal.aborted) timer = window.setTimeout(run, intervalMs);
    };

    void run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enabled, intervalMs, load]);

  return state;
}
