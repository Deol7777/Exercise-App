/**
 * The week helpers, which are the ones with something to get wrong: everything
 * else in src/lib/time-zone.ts is exercised through the screens that use it.
 *
 * Each expectation is written as `zonedInstant(…)` — a wall-clock time in the
 * app's zone — rather than as a UTC literal. A UTC literal would pass while
 * meaning something else eight hours away.
 */
import { describe, expect, it } from "vitest";

import { shiftZonedWeeks, startOfZonedWeek, zonedInstant } from "./time-zone";

describe("start of the zoned week", () => {
  it("walks back to Monday midnight", () => {
    /** Wednesday 11 March 2026, mid-morning. */
    expect(startOfZonedWeek(zonedInstant(2026, 3, 11, 9))).toEqual(zonedInstant(2026, 3, 9));
  });

  it("keeps Sunday in the week that started six days earlier", () => {
    /** ISO weeks end on Sunday; `date_trunc('week', …)` agrees, and so must this. */
    expect(startOfZonedWeek(zonedInstant(2026, 3, 8, 23))).toEqual(zonedInstant(2026, 3, 2));
  });

  it("is its own start on a Monday at midnight", () => {
    const monday = zonedInstant(2026, 3, 9);
    expect(startOfZonedWeek(monday)).toEqual(monday);
  });

  it("crosses into the previous month when the 1st is not a Monday", () => {
    /** 1 March 2026 is a Sunday, so its week began on 23 February. */
    expect(startOfZonedWeek(zonedInstant(2026, 3, 1, 18))).toEqual(zonedInstant(2026, 2, 23));
  });

  it("puts a late-evening Pacific session in the week it was trained", () => {
    /** 22:00 Sunday in California is already Monday in UTC — a whole week out. */
    expect(startOfZonedWeek(zonedInstant(2026, 3, 8, 22))).toEqual(zonedInstant(2026, 3, 2));
  });
});

describe("shifting by whole weeks", () => {
  it("lands on midnight across the spring-forward week", () => {
    /** Pacific loses an hour on 8 March 2026; seven flat days would land at 01:00. */
    expect(shiftZonedWeeks(zonedInstant(2026, 3, 2), 1)).toEqual(zonedInstant(2026, 3, 9));
  });

  it("lands on midnight across the fall-back week", () => {
    /** And gains one on 1 November 2026, which would land at 23:00 the day before. */
    expect(shiftZonedWeeks(zonedInstant(2026, 10, 26), 1)).toEqual(zonedInstant(2026, 11, 2));
  });

  it("goes backwards, across a year boundary", () => {
    expect(shiftZonedWeeks(zonedInstant(2026, 1, 5), -1)).toEqual(zonedInstant(2025, 12, 29));
  });

  it("is the identity at zero", () => {
    const monday = zonedInstant(2026, 6, 15);
    expect(shiftZonedWeeks(monday, 0)).toEqual(monday);
  });

  it("stays on Mondays over a long run backwards", () => {
    const start = startOfZonedWeek(zonedInstant(2026, 8, 19));
    for (let weeks = 1; weeks <= 52; weeks += 1) {
      const shifted = shiftZonedWeeks(start, -weeks);
      /** The only property that matters to the volume chart: it is still a week start. */
      expect(startOfZonedWeek(shifted)).toEqual(shifted);
    }
  });
});
