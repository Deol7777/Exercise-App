/**
 * The bucket arithmetic the charts zero-fill onto. Every expectation is a
 * wall-clock time in the app's zone, because that is where the boundaries are
 * cut — a UTC literal would pass while meaning a different day.
 */
import { describe, expect, it } from "vitest";

import {
  bucketStart,
  DEFAULT_RANGE,
  parseRange,
  RANGE_SHAPE,
  rangeBuckets,
  rangeStart,
  shiftBucket,
} from "./range";
import { startOfZonedDay, zonedInstant } from "./time-zone";

describe("parsing a range", () => {
  it("takes the three it knows", () => {
    expect(parseRange("week")).toBe("week");
    expect(parseRange("month")).toBe("month");
    expect(parseRange("year")).toBe("year");
  });

  it("falls back rather than throwing on anything else", () => {
    expect(parseRange(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRange("")).toBe(DEFAULT_RANGE);
    expect(parseRange("decade")).toBe(DEFAULT_RANGE);
    expect(parseRange("__proto__")).toBe(DEFAULT_RANGE);
  });
});

describe("bucket starts", () => {
  it("cuts a day at midnight in the zone", () => {
    expect(bucketStart(zonedInstant(2026, 3, 11, 23, 30), "day")).toEqual(
      zonedInstant(2026, 3, 11),
    );
  });

  it("cuts a week at midnight Monday", () => {
    expect(bucketStart(zonedInstant(2026, 3, 11, 9), "week")).toEqual(zonedInstant(2026, 3, 9));
  });

  it("cuts a month at midnight on the 1st", () => {
    expect(bucketStart(zonedInstant(2026, 3, 31, 20), "month")).toEqual(zonedInstant(2026, 3, 1));
  });
});

describe("shifting by buckets", () => {
  it("walks days, weeks and months backwards", () => {
    expect(shiftBucket(zonedInstant(2026, 3, 11), -3, "day")).toEqual(zonedInstant(2026, 3, 8));
    expect(shiftBucket(zonedInstant(2026, 3, 9), -2, "week")).toEqual(zonedInstant(2026, 2, 23));
    expect(shiftBucket(zonedInstant(2026, 3, 1), -4, "month")).toEqual(zonedInstant(2025, 11, 1));
  });

  /** Pacific loses an hour on 8 March 2026 and gains one on 1 November. */
  it("stays on midnight across both daylight-saving changes", () => {
    expect(shiftBucket(zonedInstant(2026, 3, 7), 2, "day")).toEqual(zonedInstant(2026, 3, 9));
    expect(shiftBucket(zonedInstant(2026, 10, 31), 2, "day")).toEqual(zonedInstant(2026, 11, 2));
  });
});

describe("the buckets of a range", () => {
  const now = zonedInstant(2026, 3, 15, 14);

  it("has as many buckets as the range says, ending on the current one", () => {
    for (const range of ["week", "month", "year"] as const) {
      const buckets = rangeBuckets(range, now);
      expect(buckets).toHaveLength(RANGE_SHAPE[range].buckets);
      expect(buckets[0]).toEqual(rangeStart(range, now));
      expect(buckets[buckets.length - 1]).toEqual(
        bucketStart(now, RANGE_SHAPE[range].granularity),
      );
    }
  });

  it("ends a week on today and starts it six days back", () => {
    const buckets = rangeBuckets("week", now);
    expect(buckets[6]).toEqual(zonedInstant(2026, 3, 15));
    expect(buckets[0]).toEqual(zonedInstant(2026, 3, 9));
  });

  it("ends a year on this month and starts it eleven months back", () => {
    const buckets = rangeBuckets("year", now);
    expect(buckets[11]).toEqual(zonedInstant(2026, 3, 1));
    expect(buckets[0]).toEqual(zonedInstant(2025, 4, 1));
  });

  /**
   * The daily series for "1 month" spans 8 March 2026, the day Pacific loses an
   * hour. Every bucket still has to be a midnight, or a day's volume lands in a
   * slot the series does not contain and the bar reads zero.
   */
  it("keeps every daily bucket on midnight across a spring-forward", () => {
    const buckets = rangeBuckets("month", now);

    expect(buckets.some((bucket) => bucket.getTime() === zonedInstant(2026, 3, 8).getTime())).toBe(
      true,
    );
    for (const bucket of buckets) {
      expect(startOfZonedDay(bucket)).toEqual(bucket);
    }
  });

  it("never repeats a bucket", () => {
    for (const range of ["week", "month", "year"] as const) {
      const buckets = rangeBuckets(range, now);
      expect(new Set(buckets.map((bucket) => bucket.getTime())).size).toBe(buckets.length);
    }
  });
});
