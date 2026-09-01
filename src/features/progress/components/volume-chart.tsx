import { type ChartType, labelledIndices } from "@/features/progress/utils/chart";
import { compactNumber } from "@/lib/format";
import { type Granularity, type Range, RANGE_SHAPE } from "@/lib/range";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import { formatVolume, fromKilograms, type WeightUnit } from "@/lib/weight";
import type { BucketVolume } from "@/server/services/progress";

import { SeriesChart, type AxisTick, type SeriesPoint } from "./series-chart";

/**
 * Working volume — reps × weight, summed — one point per bucket, oldest first.
 *
 * Every bucket of the range gets a point, including the empty ones: the service
 * zero-fills for exactly this reason. A missing day silently closed up would
 * redraw a fortnight off as an unbroken run, which is the one thing this chart
 * must not do.
 *
 * The y axis starts at zero, unlike the strength chart's. Volume is a quantity,
 * so a bar half as tall has to be half the work.
 */
export function VolumeChart({
  buckets,
  range,
  type,
  unit,
}: {
  buckets: BucketVolume[];
  range: Range;
  type: ChartType;
  unit: WeightUnit;
}) {
  const { granularity } = RANGE_SHAPE[range];

  /* Points sit at the centre of their band, not on its edge — a bar hangs
     around its own slot, and the line joins the middles of them. */
  const series: SeriesPoint[] = buckets.map((bucket, index) => ({
    x: (index + 0.5) / buckets.length,
    value: bucket.volume,
    title: `${bucketLabel(bucket.bucket, granularity)}: ${formatVolume(bucket.volume, unit)}`,
  }));

  const ticks: AxisTick[] = [...labelledIndices(buckets.length)]
    .sort((a, b) => a - b)
    .map((index) => ({
      x: (index + 0.5) / buckets.length,
      text: bucketLabel(buckets[index].bucket, granularity),
    }));

  return (
    <div className="mt-5">
      <SeriesChart
        points={series}
        type={type}
        ticks={ticks}
        band={1 / buckets.length}
        zeroBased
        /* Volume runs to five and six figures, which will not fit beside an
           axis — 62,410 becomes "62k". */
        format={(value) => compactNumber(fromKilograms(value, unit))}
        label={`Working volume across ${buckets.length} ${granularity}s, ending at ${formatVolume(buckets[buckets.length - 1].volume, unit)}.`}
      />
    </div>
  );
}

/** A month gets its name; a day or a week gets the date it starts on. */
function bucketLabel(bucket: Date, granularity: Granularity): string {
  return bucket.toLocaleDateString(
    undefined,
    granularity === "month"
      ? { month: "short", timeZone: APP_TIME_ZONE }
      : { day: "numeric", month: "short", timeZone: APP_TIME_ZONE },
  );
}
