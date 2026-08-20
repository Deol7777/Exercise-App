/**
 * Calendar-month arithmetic for the history screen.
 *
 * Every date here is built and read in **UTC** — `Date.UTC`, `getUTCDay`,
 * `getUTCDate` — never the local getters. That is deliberate: the day a workout
 * falls on is decided by `date_trunc('day', started_at)` in Postgres, which on
 * Neon is UTC (see `findMonthOfSessions`). If this module used the local
 * calendar, the query and the grid would disagree about which cell a session
 * belongs to for every user outside UTC, and the offending day would light up
 * next to the one that has the session.
 *
 * The consequence a user can actually see: a workout started at 23:30 local
 * time in New York is already the next day in UTC, so it lands on tomorrow's
 * cell. That is the same cut `findWeekTotals` and `dayLabel` already use, so
 * the app is at least consistently wrong rather than internally inconsistent.
 */

/** A month, with `month` 1-indexed the way a human writes it — 8 is August. */
export type Month = { year: number; month: number };

const KEY = /^(\d{4})-(\d{2})$/;

/** How the month travels in the URL: `?month=2026-08`. */
export function monthKey({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * The month a `?month=` parameter names, or the current one.
 *
 * Anything unparseable — a wrong shape, month 13, a year outside the range a
 * workout log could plausibly hold — falls back to the current month rather
 * than throwing. A hand-edited query string is a wrong guess, not an error
 * worth a 500, and there is no body here for a Zod schema to sit at the edge of.
 */
export function parseMonth(value: string | undefined, now: Date = new Date()): Month {
  const current = currentMonth(now);
  if (!value) return current;

  const match = KEY.exec(value);
  if (!match) return current;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return current;
  if (year < 2000 || year > current.year + 1) return current;

  return { year, month };
}

export function currentMonth(now: Date = new Date()): Month {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Midnight UTC on the 1st — the lower bound of the month's query. */
export function monthStart({ year, month }: Month): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Midnight UTC on the 1st of the *next* month: the exclusive upper bound. */
export function monthEnd(month: Month): Date {
  return monthStart(nextMonth(month));
}

export function nextMonth({ year, month }: Month): Month {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function previousMonth({ year, month }: Month): Month {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function isSameMonth(a: Month, b: Month): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Whether `month` is at or past the current one — what disables the next arrow. */
export function isFutureOrCurrent(month: Month, now: Date = new Date()): boolean {
  const current = currentMonth(now);
  return month.year > current.year || (month.year === current.year && month.month >= current.month);
}

export function daysInMonth({ year, month }: Month): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * "August", or "August 2025" once the year stops being the obvious one. The
 * headline says the month; repeating the current year in it is noise.
 */
export function monthLabel(month: Month, now: Date = new Date()): string {
  const date = monthStart(month);
  return date.toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
    ...(month.year === now.getUTCFullYear() ? {} : { year: "numeric" }),
  });
}

/** Monday-first weekday headers, localised: M T W T F S S. */
export function weekdayInitials(): string[] {
  /** 2024-01-01 was a Monday, so this walks Monday → Sunday. */
  return Array.from({ length: 7 }, (_, index) =>
    new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(undefined, {
      weekday: "narrow",
      timeZone: "UTC",
    }),
  );
}

/**
 * The grid: leading blanks for the days of the previous month, then 1…n.
 *
 * Monday-first, because `date_trunc('week', …)` is ISO and the rest of the app
 * already calls Monday the start of a week. `getUTCDay` is Sunday-first, hence
 * the `+ 6` rotation.
 */
export function monthGrid(month: Month): (number | null)[] {
  const leading = (monthStart(month).getUTCDay() + 6) % 7;
  const days = daysInMonth(month);

  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
}
