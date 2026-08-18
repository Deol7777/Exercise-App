/**
 * Unit conversion. Pure functions, no database — but the arithmetic is the part
 * of the pounds feature that can be silently wrong, because a slightly-off
 * factor still looks plausible on screen.
 */
import { describe, expect, it } from "vitest";

import { formatVolume, formatWeight, fromKilograms, toKilograms } from "./weight";

describe("kilograms", () => {
  it("passes through untouched", () => {
    expect(fromKilograms(62.5, "kg")).toBe(62.5);
    expect(toKilograms(62.5, "kg")).toBe(62.5);
  });

  it("rounds typed kilograms to what numeric(6, 2) keeps", () => {
    expect(toKilograms(20.005, "kg")).toBe(20.01);
    expect(toKilograms(20.004, "kg")).toBe(20);
  });
});

describe("pounds", () => {
  it("uses the exact avoirdupois pound", () => {
    /** 1 lb = 0.45359237 kg, by definition. */
    expect(toKilograms(1, "lb")).toBe(0.45);
    expect(toKilograms(100, "lb")).toBe(45.36);
    expect(toKilograms(225, "lb")).toBe(102.06);
  });

  it("converts stored kilograms for display", () => {
    expect(fromKilograms(100, "lb")).toBe(220.5);
    expect(fromKilograms(20, "lb")).toBe(44.1);
  });

  it("round-trips a typed value back to itself", () => {
    for (const pounds of [45, 95, 135, 185, 225, 315]) {
      expect(fromKilograms(toKilograms(pounds, "lb"), "lb")).toBe(pounds);
    }
  });

  it("keeps bodyweight zero as zero", () => {
    expect(toKilograms(0, "lb")).toBe(0);
    expect(fromKilograms(0, "lb")).toBe(0);
  });
});

describe("formatting", () => {
  it("names the unit it is showing", () => {
    expect(formatWeight(100, "kg")).toBe("100 kg");
    expect(formatWeight(100, "lb")).toBe("220.5 lb");
  });

  it("shows volume in whole units, grouped", () => {
    expect(formatVolume(12_345.6, "kg")).toBe("12,346 kg");
    expect(formatVolume(1_000, "lb")).toBe("2,205 lb");
  });
});
