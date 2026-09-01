import { type ChartType, labelledIndices } from "@/features/progress/utils/chart";
import { RANGE_SHAPE, type Range, rangeBuckets } from "@/lib/range";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import { fromKilograms, type WeightUnit } from "@/lib/weight";
import type { StrengthPoint } from "@/server/services/progress";

import { SeriesChart, type AxisTick, type SeriesPoint } from "./series-chart";

/**
 * The heaviest working set of each day, oldest on the left.
 *
 * The value plotted is measured, not estimated: whatever the heaviest bar was
 * that day, whether it was a single or a set of twelve. The reps are on the
 * point's tooltip and in the stats beside the chart, but they do not move it —
 * the y axis is weight.
 *
 * The x axis is *time*, not the position in the list, and it spans the whole
 * selected range rather than first-workout-to-last. Six sessions in a fortnight
 * followed by nothing until March is the shape of that training; spacing the
 * points evenly would draw it as a steady climb, and starting the axis at the
 * first workout would hide a month off at the beginning.
 */
export function StrengthChart({
  points,
  range,
  type,
  unit,
  now,
}: {
  points: StrengthPoint[];
  range: Range;
  type: ChartType;
  unit: WeightUnit;
  /** The same `now` the page resolved the range with, so the axis ends today. */
  now: Date;
}) {
  const buckets = rangeBuckets(range, now);
  const from = buckets[0].getTime();
  /** The end of the last bucket, so a point logged today is not off the edge. */
  const to = buckets[buckets.length - 1].getTime();
  const span = Math.max(to - from, 1);

  const series: SeriesPoint[] = points.map((point) => ({
    /* Clamped because a point can sit inside the final bucket but past its
       start, which would otherwise place it beyond the right-hand edge. */
    x: Math.min(Math.max((point.day.getTime() - from) / span, 0), 1),
    value: point.weight,
    title: `${dayLabel(point.day)}: ${fromKilograms(point.weight, unit)} ${unit} × ${point.reps}`,
  }));

  const ticks: AxisTick[] = [...labelledIndices(buckets.length)]
    .sort((a, b) => a - b)
    .map((index) => ({
      x: index / Math.max(buckets.length - 1, 1),
      text: dayLabel(buckets[index]),
    }));

  return (
    <div className="mt-5">
      <SeriesChart
        points={series}
        type={type}
        ticks={ticks}
        band={1 / RANGE_SHAPE[range].buckets}
        /* Weight, so the axis is the band the data sits in and not a squeeze
           against a zero nobody lifts. */
        zeroBased={false}
        format={(value) => `${Math.round(fromKilograms(value, unit))}`}
        label={summarise(points, unit)}
      />
    </div>
  );
}

function dayLabel(day: Date): string {
  return day.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: APP_TIME_ZONE,
  });
}

/** The chart in a sentence. A line drawing is worth nothing without one. */
function summarise(points: StrengthPoint[], unit: WeightUnit): string {
  const round = (kilograms: number) => Math.round(fromKilograms(kilograms, unit));
  const latest = points[points.length - 1];

  if (points.length === 1) {
    return `One day trained, top set ${round(latest.weight)} ${unit}.`;
  }

  return `Heaviest working set across ${points.length} days, from ${round(points[0].weight)} to ${round(latest.weight)} ${unit}.`;
}
