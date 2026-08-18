/**
 * Display units.
 *
 * Weight is kilograms in the database, always — `sets.weight` is `numeric` in
 * kg and nothing else is ever stored. A user who thinks in pounds is a
 * *presentation* concern, so every conversion happens at an edge: here, called
 * from a component before rendering or before a request goes out. No service
 * and no query ever sees a pound.
 */
export const WEIGHT_UNITS = ["kg", "lb"] as const;

export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** The exact international avoirdupois definition: 1 lb = 0.45359237 kg. */
const KG_PER_LB = 0.45359237;

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  kg: "Kilograms",
  lb: "Pounds",
};

/** Kilograms as stored → the number to show. */
export function fromKilograms(kilograms: number, unit: WeightUnit): number {
  if (unit === "kg") return kilograms;
  return round(kilograms / KG_PER_LB, 1);
}

/**
 * What the user typed → kilograms to store, at the two decimal places
 * `numeric(6, 2)` keeps. Rounding here rather than in the database means the
 * value that comes back is the value that was written.
 */
export function toKilograms(entered: number, unit: WeightUnit): number {
  if (unit === "kg") return round(entered, 2);
  return round(entered * KG_PER_LB, 2);
}

/** Formatted for display, with the unit — the one place the suffix is decided. */
export function formatWeight(kilograms: number, unit: WeightUnit): string {
  return `${fromKilograms(kilograms, unit)} ${unit}`;
}

/** Sums are in kilograms too; volume is large, so it shows whole units. */
export function formatVolume(kilograms: number, unit: WeightUnit): string {
  return `${Math.round(fromKilograms(kilograms, unit)).toLocaleString()} ${unit}`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
