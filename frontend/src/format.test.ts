import { describe, it, expect, afterEach } from '@jest/globals';
import { climateLines, dayKey, formatTemperature, formatValue, minuteOfDay, startOfDay } from './format';
import { setLang } from './i18n';

afterEach(() => setLang('en'));

describe('number formats', () => {
  it('follows the chosen language', () => {
    setLang('en');
    expect(formatTemperature(21.46)).toBe('21.5 °C');
    expect(formatValue(37.5)).toBe('37.5');
    setLang('es');
    expect(formatTemperature(21.46)).toBe('21,5 °C');
    expect(formatValue(37.5)).toBe('37,5');
  });

  it('writes whole numbers without decimals', () => {
    expect(formatValue(15)).toBe('15');
  });
});

describe('climateLines', () => {
  it('joins temperature and humidity on one line', () => {
    expect(climateLines(21.5, 61)).toHaveLength(1);
  });

  it('gives no line when the reading has neither', () => {
    expect(climateLines(null, undefined)).toEqual([]);
    expect(climateLines(Number.NaN, null)).toEqual([]);
  });
});

describe('dates', () => {
  const date = new Date(2026, 9, 6, 14, 5, 30);

  it('keys days as local YYYY-MM-DD, as the API does', () => {
    expect(dayKey(date)).toBe('2026-10-06');
    expect(dayKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('counts minutes since local midnight', () => {
    expect(minuteOfDay(date)).toBe(14 * 60 + 5);
  });

  it('finds local midnight without changing the date it is given', () => {
    const midnight = startOfDay(date);
    expect([midnight.getHours(), midnight.getMinutes(), midnight.getDate()]).toEqual([0, 0, 6]);
    expect(date.getHours()).toBe(14);
  });
});
