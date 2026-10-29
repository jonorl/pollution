import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { usePolled } from './usePolled';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

// Lets the awaited load settle and React apply the state it sets.
const flush = () => act(async () => {});

describe('usePolled', () => {
  it('loads at once and again every interval', async () => {
    const load = jest.fn<(signal: AbortSignal) => Promise<unknown>>(() => Promise.resolve(1));
    const { result } = renderHook(() => usePolled(true, 30_000, load));
    await flush();
    expect(result.current).toEqual({ data: 1, failed: false });

    load.mockResolvedValue(2);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe(2);
  });

  it('keeps the last good data through a failure', async () => {
    const load = jest.fn<(signal: AbortSignal) => Promise<unknown>>(() => Promise.resolve('ok'));
    const { result } = renderHook(() => usePolled(true, 1000, load));
    await flush();

    load.mockRejectedValue(new Error('offline'));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toEqual({ data: 'ok', failed: true });
  });

  it('does nothing while disabled', async () => {
    const load = jest.fn<(signal: AbortSignal) => Promise<unknown>>(() => Promise.resolve(1));
    renderHook(() => usePolled(false, 1000, load));
    await flush();
    expect(load).not.toHaveBeenCalled();
  });

  it('aborts the request and stops polling once unmounted', async () => {
    const load = jest.fn<(signal: AbortSignal) => Promise<unknown>>(() => Promise.resolve(1));
    const { unmount } = renderHook(() => usePolled(true, 1000, load));
    await flush();
    unmount();
    expect(load.mock.calls[0][0].aborted).toBe(true);

    jest.advanceTimersByTime(5000);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
