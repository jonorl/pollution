import type { Reading } from '../api';
import { breathCounts, lungDamage, MAX_DOTS, particlesPerDot } from '../breath';

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
  it("scales the sensor's 0.1 L counts up to a 0.5 L breath", () => {
    const counts = breathCounts(reading({ n0_3: 1000, n0_5: 300, n1_0: 50, n2_5: 5, n5_0: 1, n10: 0 }));
    expect(counts).toEqual({ total: 5000, shares: [0.3, 0.05, 0.005, 0.001, 0], measured: true });
  });

  it('estimates from PM2.5 for rows from before the firmware sent counts', () => {
    expect(breathCounts(reading({ pm2_5: 10 }))).toMatchObject({ total: 8000, measured: false });
  });
});

describe('particlesPerDot', () => {
  it("keeps within the web's phone budget", () => {
    expect(particlesPerDot(MAX_DOTS)).toBe(1);
    expect(particlesPerDot(MAX_DOTS + 1)).toBe(2);
  });
});

describe('lungDamage', () => {
  it('runs from 0 at the annual guideline to 1 at 110 µg/m³', () => {
    expect(lungDamage(5)).toBe(0);
    expect(lungDamage(37.5)).toBeCloseTo(0.5);
    expect(lungDamage(110)).toBe(1);
  });
});
