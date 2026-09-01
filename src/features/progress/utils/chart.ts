/**
 * The bits of chart drawing that are arithmetic rather than design, kept out of
 * the components so both charts round their axes the same way.
 *
 * Nothing here knows about SVG. It answers two questions: which numbers go
 * beside the y axis, and which of a row of buckets can afford a label.
 */
export const CHART_TYPES = ["line", "bar"] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: "Line",
  bar: "Bars",
};

/** A `?…Chart=` parameter, or the fallback the card prefers. */
export function parseChartType(value: string | undefined, fallback: ChartType): ChartType {
  return CHART_TYPES.includes(value as ChartType) ? (value as ChartType) : fallback;
}

/**
 * A rounded step at or above `rough` — 1, 2, 2.5 or 5 times a power of ten.
 *
 * Axis labels exist to be read off, and 137.4 is not a number anybody reads off
 * an axis. Snapping the *step* rather than the values keeps the gridlines
 * evenly spaced, which snapping each label separately would not.
 */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;

  if (normalised <= 1) return magnitude;
  if (normalised <= 2) return 2 * magnitude;
  if (normalised <= 2.5) return 2.5 * magnitude;
  if (normalised <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * The values to draw gridlines at, covering `low` to `high` inclusive.
 *
 * Returns the band the chart should actually be scaled to as well, because the
 * top gridline has to *be* the top of the plot — a chart drawn to its data's
 * maximum with a gridline drawn to a rounded number above it puts the line off
 * the top of the card.
 */
export function axisTicks(
  low: number,
  high: number,
  count = 3,
): { ticks: number[]; bottom: number; top: number } {
  /** A flat series still needs a band, or every scale below divides by zero. */
  if (high <= low) {
    const top = high === 0 ? 1 : high * 1.2;
    return { ticks: [0, top], bottom: 0, top };
  }

  const step = niceStep((high - low) / count);
  const bottom = Math.floor(low / step) * step;
  const top = Math.ceil(high / step) * step;

  const ticks: number[] = [];
  /** Floating point: 0.1 + 0.2 walks past the top and adds a phantom line. */
  for (let value = bottom; value <= top + step / 1000; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return { ticks, bottom, top };
}

/**
 * Which of `total` positions get an x-axis label, first and last always
 * included.
 *
 * Thirty daily buckets cannot all be labelled at 10px on a phone, and dropping
 * to "first and last only" loses the reader's place in the middle. This spaces
 * about `wanted` of them evenly and lets the rest go unlabelled.
 */
export function labelledIndices(total: number, wanted = 4): Set<number> {
  if (total <= wanted) return new Set(Array.from({ length: total }, (_, index) => index));

  const step = (total - 1) / (wanted - 1);
  const indices = new Set<number>();
  for (let index = 0; index < wanted; index += 1) {
    indices.add(Math.round(index * step));
  }

  return indices;
}
