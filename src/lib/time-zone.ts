/**
 * The one timezone the app decides days in.
 *
 * Every "day", "today", "this week" and calendar cell in the app is cut here,
 * not in UTC and not in the viewer's browser. Two reasons it is a fixed zone
 * rather than the local one: the same question has to get the same answer in
 * Postgres and in JS — the calendar grid and the query that fills it cannot
 * disagree about which day a session belongs to — and a server rendering in UTC
 * on Vercel would otherwise call 5pm Tuesday "Wednesday".
 *
 * It is the IANA zone, deliberately, not the -07:00 offset that "PDT" names.
 * Pacific is PDT from March to November and PST for the rest of the year; an
 * offset hardcoded in August silently moves every day boundary by an hour on
 * the first Sunday of November.
 *
 * The real fix, when the app has users in more than one zone, is a `time_zone`
 * column on `users` read the way `weight_unit` already is. Until then this is
 * the single place to change, and nothing outside it may reach for
 * `getHours`, `getDate` or any other local-time getter.
 */
export const APP_TIME_ZONE = "America/Los_Angeles";

/** For SQL: `started_at AT TIME ZONE APP_TIME_ZONE`. Escaped once, here. */
export const APP_TIME_ZONE_SQL = `'${APP_TIME_ZONE}'`;

const WALL_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  /** h23 rather than hour12: false — some ICU builds render midnight as "24". */
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export type ZonedDate = {
  year: number;
  /** 1-indexed, the way a human writes it. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** What a clock on the wall in the zone reads at that instant. */
export function zonedDate(instant: Date): ZonedDate {
  const parts: Record<string, string> = {};
  for (const part of WALL_CLOCK.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * The instant a wall-clock time in the zone corresponds to — the inverse of
 * `zonedDate`.
 *
 * Two passes, because the offset to subtract depends on the instant being
 * computed: guessing with the offset at the *naive* time gets the wrong side of
 * a DST change, and re-reading the offset at the guess corrects it. Midnight is
 * never the hour that spring-forward skips, so the second pass always settles.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const guess = naive - offsetAt(new Date(naive));
  return new Date(naive - offsetAt(new Date(guess)));
}

/** Midnight in the zone, on the day that instant falls on. */
export function startOfZonedDay(instant: Date): Date {
  const { year, month, day } = zonedDate(instant);
  return zonedInstant(year, month, day);
}

/**
 * Midnight Monday in the zone, on the week that instant falls in.
 *
 * This has to agree, to the millisecond, with what Postgres computes as
 * `date_trunc('week', ts at time zone APP_TIME_ZONE) at time zone APP_TIME_ZONE`
 * — the cut `findWeeklyVolume` groups on. `date_trunc('week', …)` is ISO, so the
 * week starts on Monday; `getUTCDay` is Sunday-first, hence the `+ 6` rotation,
 * the same one `monthGrid` uses. Reading the weekday off a bare `Date.UTC` is
 * deliberate: which weekday a *calendar* date falls on is true in every zone.
 *
 * A week start that disagrees with the database's does not throw — the two
 * simply stop matching up, and a chart keyed on it silently reports every week
 * as empty. src/server/services/progress.test.ts asserts the two agree.
 */
export function startOfZonedWeek(instant: Date): Date {
  const { year, month, day } = zonedDate(instant);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  /** `day - weekday` can go to zero or below; `Date.UTC` rolls into the previous month. */
  return zonedInstant(year, month, day - weekday);
}

/**
 * The same weekday, `weeks` weeks away — forward for a positive count, back for
 * a negative one.
 *
 * Adding 7 × 604,800,000 ms would be wrong twice a year: a week spanning a
 * daylight-saving change is 23 or 25 hours longer than seven flat days, and the
 * result would land at 23:00 or 01:00 rather than midnight. Counting in
 * calendar days and re-resolving the instant keeps it on midnight.
 */
export function shiftZonedWeeks(instant: Date, weeks: number): Date {
  return shiftZonedDays(instant, weeks * 7);
}

/** Midnight on the 1st, in the zone, of the month that instant falls in. */
export function startOfZonedMonth(instant: Date): Date {
  const { year, month } = zonedDate(instant);
  return zonedInstant(year, month, 1);
}

/**
 * The same time of day, `days` days away. Counting in calendar days rather than
 * in milliseconds is what survives a daylight-saving change: the day a clock
 * goes forward is 23 hours long, and adding 86,400,000 lands at 01:00.
 */
export function shiftZonedDays(instant: Date, days: number): Date {
  const { year, month, day } = zonedDate(instant);
  return zonedInstant(year, month, day + days);
}

/**
 * The same day of the month, `months` months away. Only ever called on a month
 * start here, so the 31st-of-a-30-day-month question does not arise —
 * `Date.UTC` would roll it into the next month if it did.
 */
export function shiftZonedMonths(instant: Date, months: number): Date {
  const { year, month, day } = zonedDate(instant);
  return zonedInstant(year, month + months, day);
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
function offsetAt(instant: Date): number {
  const { year, month, day, hour, minute, second } = zonedDate(instant);
  return Date.UTC(year, month - 1, day, hour, minute, second) - instant.getTime();
}
