// Ski season runs December 15 → April 15.
// Booking is only allowed inside the season window.

export const SEASON_START_MONTH = 12;
export const SEASON_START_DAY = 15;
export const SEASON_END_MONTH = 4;
export const SEASON_END_DAY = 15;

function makeDate(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day);
}

export function getSeasonForDate(date: Date): { start: Date; end: Date } {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const startYear = m >= SEASON_START_MONTH ? y : y - 1;
  return {
    start: makeDate(startYear, SEASON_START_MONTH, SEASON_START_DAY),
    end: makeDate(startYear + 1, SEASON_END_MONTH, SEASON_END_DAY),
  };
}

export function isInSeason(date: Date): boolean {
  const { start, end } = getSeasonForDate(date);
  const t = stripTime(date).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function nextSeasonStart(today: Date = new Date()): Date {
  const { start, end } = getSeasonForDate(today);
  if (stripTime(today).getTime() <= end.getTime()) {
    // either inside or before season — show current season start (clamped to today)
    return today.getTime() < start.getTime() ? start : today;
  }
  // After season end — next season starts next December
  return makeDate(end.getFullYear(), SEASON_START_MONTH, SEASON_START_DAY);
}

export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
