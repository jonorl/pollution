import { useCallback, useEffect, useRef, useState } from 'react';

export interface Polled<T> {
  /** The last good response; kept through failures and while polling is paused. */
  data: T | null;
  failed: boolean;
  /** Fetches straight away, as pull-to-refresh does; resolves once that fetch has settled. */
  refresh: () => Promise<void>;
}

/** Fetches `load` now and every `intervalMs` while `enabled`, e.g. only while its view is on screen. */
export function usePolled<T>(enabled: boolean, intervalMs: number, load: (signal: AbortSignal) => Promise<T>): Polled<T> {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false });
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight: Promise<void> | null = null;

    const run = async () => {
      clearTimeout(timer);
      try {
        const data = await load(controller.signal);
        setState({ data, failed: false });
      } catch {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, failed: true }));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, intervalMs);
    };
    // A refresh during a fetch joins it, so only one timer is ever pending.
    const poll = () =>
      (inflight ??= run().finally(() => {
        inflight = null;
      }));

    pollRef.current = poll;
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      pollRef.current = null;
    };
  }, [enabled, intervalMs, load]);

  const refresh = useCallback(() => pollRef.current?.() ?? Promise.resolve(), []);
  return { ...state, refresh };
}
