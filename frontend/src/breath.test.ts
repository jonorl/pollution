import { describe, it, expect } from '@jest/globals';
import type { Reading } from './api';
import { breathCounts, lungDamage, meanPm25, particlesPerDot, MAX_DOTS } from './breath';

const reading = (overrides: Partial<Reading> = {}): Reading => ({
  id: 1,
  deviceId: 'esp32-01',
  pm1_0: 5,
  pm2_5: 10,
  pm10: 12,
  createdAt: '2026-10-29T08:00:00.000Z',
  ...overrides,
});

describe('breathCounts', () => {
  it('scales the sensor’s 0.1 L counts up to a 0.5 L breath', () => {
    const counts = breathCounts(reading({ n0_3: 1000, n0_5: 300, n1_0: 50, n2_5: 5, n5_0: 1, n10: 0 }));
    expect(counts).toEqual({ total: 5000, shares: [0.3, 0.05, 0.005, 0.001, 0], measured: true });
  });

  it('treats missing larger counts as none, and an empty sample as no shares', () => {
    expect(breathCounts(reading({ n0_3: 0 }))?.shares).toEqual([0, 0, 0, 0, 0]);
  });

  it('estimates from PM2.5 for rows from before the firmware sent counts', () => {
    const counts = breathCounts(reading({ pm2_5: 10 }));
    expect(counts?.measured).toBe(false);
    expect(counts?.total).toBe(10 * 160 * 5);
  });

  it('has nothing to say without a reading', () => {
    expect(breathCounts(null)).toBeNull();
  });
});

describe('particlesPerDot', () => {
  it('draws one dot per particle while they fit', () => {
    expect(particlesPerDot(100, false)).toBe(1);
  });

  it('gives phones a smaller budget', () => {
    expect(particlesPerDot(MAX_DOTS.fine, false)).toBe(1);
    expect(particlesPerDot(MAX_DOTS.fine, true)).toBe(Math.ceil(MAX_DOTS.fine / MAX_DOTS.coarse));
  });
});

describe('lungDamage', () => {
  it('stays at 0 up to WHO’s annual guideline and reaches 1 at the top', () => {
    expect(lungDamage(0)).toBe(0);
    expect(lungDamage(5)).toBe(0);
    expect(lungDamage(110)).toBe(1);
    expect(lungDamage(500)).toBe(1);
  });

  it('interpolates between stops', () => {
    expect(lungDamage(15)).toBeCloseTo(0.12);
    expect(lungDamage(20)).toBeCloseTo(0.21);
  });

  it('never decreases as PM2.5 rises', () => {
    let previous = 0;
    for (let pm25 = 0; pm25 <= 120; pm25 += 0.5) {
      const damage = lungDamage(pm25);
      expect(damage).toBeGreaterThanOrEqual(previous);
      previous = damage;
    }
  });
});

describe('meanPm25', () => {
  it('averages PM2.5', () => {
    expect(meanPm25([reading({ pm2_5: 10 }), reading({ pm2_5: 20 })])).toBe(15);
  });

  it('is null with no readings', () => {
    expect(meanPm25([])).toBeNull();
  });
});
