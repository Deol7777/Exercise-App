import { dayLabel } from "@/lib/format";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { fromKilograms, type WeightUnit } from "@/lib/weight";
import type { RecentRecord } from "@/server/services/progress";

/**
 * Records, most recently set first.
 *
 * Sorted by when it happened rather than by name: alphabetical is a reference
 * table, and what someone opens this card for is what they just beat. The badge
 * marks a record set inside the current week — the same week boundary the home
 * screen counts its PRs on, so the two screens cannot disagree about what is new.
 *
 * A record here is the heaviest working set (docs/glossary.md) — the same
 * measure the strength chart plots, asked over all time rather than over a
 * range. Nothing on this screen is estimated from reps.
 */
export function RecordsList({ records, unit }: { records: RecentRecord[]; unit: WeightUnit }) {
  return (
    <ul className="flex flex-col gap-4">
      {records.map((record) => (
        <li key={record.exerciseId} className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {record.exerciseName}
              {record.isNew ? (
                <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 align-middle text-[0.625rem] font-bold text-brand-deep uppercase">
                  New
                </span>
              ) : null}
            </p>
            <p className="label-caps mt-1">
              {MUSCLE_GROUP_LABELS[record.muscleGroup]} · {dayLabel(record.achievedAt)}
            </p>
          </div>
          {/* The spaces between the parts are real, not margins: this reads as
              one string — "226 lb × 5" — to anything that reads text rather
              than pixels, screen readers and the end-to-end tests included. */}
          <p className="tabular shrink-0 font-display text-lg font-extrabold whitespace-nowrap">
            {fromKilograms(record.weight, unit).toLocaleString()}{" "}
            <span className="text-[0.6em] font-semibold text-muted-foreground">{unit}</span>{" "}
            <span className="text-sm font-semibold text-muted-foreground">× {record.reps}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
