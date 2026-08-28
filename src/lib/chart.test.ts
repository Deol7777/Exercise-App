/** Axis arithmetic. Pure, and the part of a chart that is wrong silently. */
import { describe, expect, it } from "vitest";

import { axisTicks, CHART_TYPES, labelledIndices, parseChartType } from "./chart";

describe("parsing a chart type", () => {
  it("takes what it knows and falls back on the rest", () => {
    expect(parseChartType("bar", "line")).toBe("bar");
    expect(parseChartType("line", "bar")).toBe("line");
    expect(parseChartType(undefined, "bar")).toBe("bar");
    expect(parseChartType("pie", "line")).toBe("line");
  });

  it("offers exactly the two the screen draws", () => {
    expect([...CHART_TYPES]).toEqual(["line", "bar"]);
  });
});

describe("axis ticks", () => {
  it("lands on round numbers that cover the data", () => {
    const { ticks, bottom, top } = axisTicks(0, 8_328);

    expect(bottom).toBe(0);
    expect(top).toBeGreaterThanOrEqual(8_328);
    expect(ticks[0]).toBe(bottom);
    expect(ticks[ticks.length - 1]).toBe(top);
    for (const tick of ticks) expect(Number.isInteger(tick)).toBe(true);
  });

  it("keeps the top gridline at the top of the plot", () => {
    /** A band that stopped at the data would put the last point off the card. */
    const { ticks, top } = axisTicks(82, 147);
    expect(ticks[ticks.length - 1]).toBe(top);
    expect(top).toBeGreaterThanOrEqual(147);
  });

  it("gives a flat series a band to sit in rather than dividing by zero", () => {
    const { bottom, top } = axisTicks(100, 100);
    expect(top).toBeGreaterThan(bottom);
  });

  it("survives a series that is all zero", () => {
    const { bottom, top } = axisTicks(0, 0);
    expect(top).toBeGreaterThan(bottom);
  });

  it("spaces the ticks evenly", () => {
    const { ticks } = axisTicks(0, 137.4);
    const steps = ticks.slice(1).map((tick, index) => tick - ticks[index]);
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 6);
  });
});

describe("which buckets get a label", () => {
  it("labels them all when they fit", () => {
    expect([...labelledIndices(4)]).toEqual([0, 1, 2, 3]);
  });

  it("keeps the first and the last, whatever the count", () => {
    for (const total of [7, 12, 30, 52, 365]) {
      const indices = labelledIndices(total);
      expect(indices.has(0)).toBe(true);
      expect(indices.has(total - 1)).toBe(true);
      expect(indices.size).toBeLessThanOrEqual(4);
    }
  });

  it("spreads them across the middle rather than crowding an end", () => {
    expect([...labelledIndices(30)].sort((a, b) => a - b)).toEqual([0, 10, 19, 29]);
  });
});
