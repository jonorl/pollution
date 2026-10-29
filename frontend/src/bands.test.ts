import { describe, it, expect } from '@jest/globals';
import { BANDS, bandFor } from './bands';

describe('bandFor', () => {
  it.each([
    [0, 'good'],
    [15, 'good'],
    [15.1, 'moderate'],
    [37.5, 'elevated'],
    [50, 'high'],
    [75, 'veryHigh'],
    [75.1, 'extreme'],
    [900, 'extreme'],
  ])('puts %p µg/m³ in %s', (pm25, key) => {
    expect(bandFor(pm25).key).toBe(key);
  });

  it('keeps the bands in rising order, ending open', () => {
    const maxes = BANDS.map((band) => band.max);
    expect([...maxes].sort((a, b) => a - b)).toEqual(maxes);
    expect(maxes.at(-1)).toBe(Infinity);
  });
});
