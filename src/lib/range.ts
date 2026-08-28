/**
 * How far back a chart looks, and how finely it is cut.
 *
 * One range drives the whole progress screen, because two charts side by side
 * on different windows is a way to misread both. The granularity is not a
 * separate choice: seven weekly buckets over one week is a single bar, and 365
 * daily bars in a year is a smear. Each range names the cut that makes it
 * readable, and nothing else may pick one.
 *
 * Client-safe: the query that groups in SQL, the service that zero-fills in
 * JavaScript and the links that switch the range all read this file, so they
 * cannot drift.
 */
import {
  shiftZonedDays,
  shiftZonedMonths,
  shiftZonedWeeks,
  startOfZonedDay,
  startOfZonedMonth,
  startOfZonedWeek,
} from "./time-zone";

export const RANGES = ["week", "month", "year"] as const;

export type Range = (typeof RANGES)[number];

export const RANGE_LABELS: Record<Range, string> = {
  week: "1 week",
  month: "1 month",
  year: "1 year",
};

/** What the range is called in prose, mid-sentence. */
export const RANGE_PHRASES: Record<Range, string> = {
  week: "the last 7 days",
  month: "the last 30 days",
  year: "the last 12 months",
};

/** The unit a bucket is a whole one of. Matches `date_trunc`'s vocabulary. */
export type Granularity = "day" | "week" | "month";

/**
 * A month is 30 daily buckets rather than a calendar month, and a year is 12
 * calendar months rather than 52 weeks. Both are the reading that keeps the bar
 * count constant — a chart whose number of bars changes with the month is one
 * whose bars are not comparable between visits.
 */
export const RANGE_SHAPE: Record<Range, { granularity: Granularity; buckets: number }> = {
  week: { granularity: "day", buckets: 7 },
  month: { granularity: "day", buckets: 30 },
  year: { granularity: "month", buckets: 12 },
};

export const DEFAULT_RANGE: Range = "month";

/**
 * The range a `?range=` parameter names, or the default.
 *
 * Anything else falls back rather than throwing, the same way `parseMonth`
 * does: a hand-edited query string is a wrong guess, not an error worth a 500.
 */
export function parseRange(value: string | undefined): Range {
  return RANGES.includes(value as Range) ? (value as Range) : DEFAULT_RANGE;
}

/** The instant the bucket containing `instant` begins, in the app's timezone. */
export function bucketStart(instant: Date, granularity: Granularity): Date {
  if (granularity === "day") return startOfZonedDay(instant);
  if (granularity === "week") return startOfZonedWeek(instant);
  return startOfZonedMonth(instant);
}

/** `count` buckets away from a bucket start — negative counts go backwards. */
export function shiftBucket(start: Date, count: number, granularity: Granularity): Date {
  if (granularity === "day") return shiftZonedDays(start, count);
  if (granularity === "week") return shiftZonedWeeks(start, count);
  return shiftZonedMonths(start, count);
}

/**
 * The first bucket of the range: far enough back that the range's own bucket
 * count lands exactly on the bucket `now` falls in.
 *
 * This is the lower bound every query in the flow is given, so "the last 30
 * days" means one thing — the whole of the day thirty days ago included, not
 * the same clock time thirty days ago.
 */
export function rangeStart(range: Range, now: Date = new Date()): Date {
  const { granularity, buckets } = RANGE_SHAPE[range];
  return shiftBucket(bucketStart(now, granularity), -(buckets - 1), granularity);
}

/** Every bucket start in the range, oldest first. What a chart zero-fills onto. */
export function rangeBuckets(range: Range, now: Date = new Date()): Date[] {
  const { granularity, buckets } = RANGE_SHAPE[range];
  const start = rangeStart(range, now);
  return Array.from({ length: buckets }, (_, index) => shiftBucket(start, index, granularity));
}
