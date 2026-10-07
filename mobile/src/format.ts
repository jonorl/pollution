import { getLocale, tr } from './i18n';

// Shared by the panels and the 3D views, so both describe times and numbers the same way,
// in whichever language is chosen.

const formats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = getLocale();
  const key = `${locale} ${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    formats.set(key, format);
  }
  return format;
}

/** 14:05 */
export const formatTime = (value: string | number | Date) =>
  dateFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
/** Tue 6 */
export const formatShortDay = (date: Date) => dateFormat({ weekday: 'short', day: 'numeric' }).format(date);
/** Tue 6 Oct */
export const formatDay = (date: Date) => dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }).format(date);
/** Oct */
export const formatMonth = (date: Date) => dateFormat({ month: 'short' }).format(date);
/** Tue */
export const formatWeekday = (date: Date) => dateFormat({ weekday: 'short' }).format(date);

export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 21.5 °C, 21,5 °C */
export const formatTemperature = (celsius: number) => `${formatNumber(celsius, 1)} °C`;

/** A tooltip's temperature line, or none for readings from before the sensor was fitted. */
export const temperatureLines = (celsius: number | null | undefined): string[] =>
  celsius == null || Number.isNaN(celsius) ? [] : [tr().scene.temperature(formatTemperature(celsius))];

/** A value as written in prose: whole numbers without decimals, others to one place (37.5, 37,5). */
export const formatValue = (value: number) => formatNumber(value, Number.isInteger(value) ? 0 : 1);

export const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

export function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** YYYY-MM-DD in local time, matching the API's daily `day` field when it is asked for the same zone. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
