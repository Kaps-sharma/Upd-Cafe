/**
 * Calendar helpers that always work in the cafe's own time zone.
 *
 * The server may run in UTC (Netlify does), while the cafe thinks in local
 * time. Everything that decides "is this date today?" or "has this time slot
 * passed?" must therefore be calculated in the configured zone, never with
 * `new Date().getHours()`.
 *
 * These helpers are deliberately dependency-free so both server components
 * and client components can import them.
 */

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function safeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

function partsInZone(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

/** Calendar date as YYYY-MM-DD in the given IANA time zone. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Clock time as HH:MM (24-hour) in the given IANA time zone. */
export function timeKeyInZone(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Add (or subtract) whole calendar days to a YYYY-MM-DD key. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  return addDaysToDateKey(dateKey, 0) === dateKey;
}

/** Human-friendly date for a YYYY-MM-DD key. The key is already local to the cafe. */
export function formatDateKey(dateKey: string, locale?: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
