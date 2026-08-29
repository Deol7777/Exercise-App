import Link from "next/link";

import { ExerciseSelect } from "@/components/progress/exercise-select";
import { MuscleRadar } from "@/components/progress/muscle-radar";
import { RecordsList } from "@/components/progress/records-list";
import { SegmentedLinks } from "@/components/progress/segmented-links";
import { StrengthChart } from "@/components/progress/strength-chart";
import { VolumeChart } from "@/components/progress/volume-chart";
import { Screen, ScreenHeader, SectionHeader } from "@/components/layout/screen";
import { Delta, Stat, StatRow } from "@/components/ui/stat";
import { Surface, SurfaceRule } from "@/components/ui/surface";
import { CHART_TYPES, CHART_TYPE_LABELS, parseChartType } from "@/lib/chart";
import { dayLabel, plural } from "@/lib/format";
import { parseRange, RANGE_PHRASES, RANGE_SHAPE, RANGES, RANGE_LABELS } from "@/lib/range";
import { fromKilograms, type WeightUnit } from "@/lib/weight";
import { requireAccount } from "@/app/_lib/require-account";
import {
  getExerciseVolume,
  getLastTopSet,
  getLoggedExercises,
  getRecentRecords,
  getStrengthProgress,
  getVolumeSummary,
  type TopSet,
} from "@/server/services/progress";

/** Records are a card, not a table — past this many, nobody is reading. */
const RECORDS = 8;

const RANGE_OPTIONS = RANGES.map((range) => ({ value: range, label: RANGE_LABELS[range] }));
const CHART_OPTIONS = CHART_TYPES.map((type) => ({ value: type, label: CHART_TYPE_LABELS[type] }));

/**
 * Progress: whether one lift is moving, what it did last time out, where the
 * work went, and what has been beaten lately.
 *
 * A server component throughout. The lift dropdown is the only client component
 * on the screen and it holds no state of its own — every choice on this page
 * lives in the URL, so charts are rendered rather than fetched, the back button
 * walks back through what someone just compared, and a pasted link shows what
 * the sender was looking at.
 *
 * Four parameters, all resolved here and handed down as `query` so that each
 * control can write its own without clearing anybody else's: `?range=`,
 * `?exercise=`, `?strengthChart=`, `?volumeChart=`.
 *
 * One lift and one range govern the whole screen, chosen at the top rather than
 * per card. Two charts stacked on different lifts read as one picture and say
 * something true of neither. The muscle-balance card is the deliberate
 * exception — it is always all training, and says so on its face.
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    exercise?: string;
    range?: string;
    strengthChart?: string;
    volumeChart?: string;
  }>;
}) {
  const { userId, unit } = await requireAccount();
  const parameters = await searchParams;

  /** One `now` for the whole render, so every card cuts the range identically. */
  const now = new Date();
  const range = parseRange(parameters.range);
  /**
   * A line for strength and bars for volume, until someone says otherwise. A
   * top set is a level that moves between days, and a line is how a level
   * reads; volume is a quantity per bucket, and a quantity is a bar.
   */
  const strengthType = parseChartType(parameters.strengthChart, "line");
  const volumeType = parseChartType(parameters.volumeChart, "bar");

  const [logged, volume, records] = await Promise.all([
    getLoggedExercises(userId, now),
    getVolumeSummary(userId, range, now),
    getRecentRecords(userId, { limit: RECORDS }, now),
  ]);

  /**
   * An unknown or someone else's id falls back rather than erroring — a
   * hand-edited query string is a wrong guess, not a 404, and the dropdown only
   * ever offers ids this user has logged.
   */
  const selected = logged.find((exercise) => exercise.exerciseId === parameters.exercise) ?? logged[0] ?? null;

  const [strength, series, topSet] = await Promise.all([
    selected ? getStrengthProgress(userId, selected.exerciseId, range, now) : null,
    selected ? getExerciseVolume(userId, selected.exerciseId, range, now) : null,
    selected ? getLastTopSet(userId, selected.exerciseId) : null,
  ]);

  const options = logged.map((exercise) => ({ id: exercise.exerciseId, name: exercise.name }));
  const query = {
    range,
    exercise: selected?.exerciseId ?? "",
    strengthChart: strengthType,
    volumeChart: volumeType,
  };

  const { granularity, buckets } = RANGE_SHAPE[range];
  const bucketNoun = granularity === "month" ? "months" : "days";

  return (
    <Screen>
      <ScreenHeader eyebrow="Progress" title="Proof, or something like it." />

      {/* One lift and one range for everything below. Two charts side by side
          on different lifts, or different windows, is a way to misread both. */}
      <div className="mb-8 flex flex-col gap-3">
        {selected ? (
          <ExerciseSelect
            value={selected.exerciseId}
            options={options}
            query={query}
            label="Lift to chart"
          />
        ) : null}
        <SegmentedLinks
          options={RANGE_OPTIONS}
          value={range}
          param="range"
          query={query}
          label="Time range"
        />
      </div>

      <section aria-label="Strength">
        <SectionHeader
          label="Strength"
          action={
            strength?.change != null ? (
              <Delta value={Math.round(fromKilograms(strength.change, unit))} unit={unit} />
            ) : null
          }
        />
        <Surface>
          {selected && strength && strength.latest && strength.best ? (
            <>
              {/* The lift is named on every card, not only in the dropdown at
                  the top: by the time this one is on screen the dropdown is
                  not, and a chart nobody can name is a chart of nothing. */}
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{selected.name}</span> ·
                  heaviest working set per day · {plural(strength.points.length, "day")} trained in{" "}
                  {RANGE_PHRASES[range]}
                </p>
                <SegmentedLinks
                  options={CHART_OPTIONS}
                  value={strengthType}
                  param="strengthChart"
                  query={query}
                  label="Strength chart type"
                  className="shrink-0"
                />
              </div>

              <StrengthChart
                points={strength.points}
                range={range}
                type={strengthType}
                unit={unit}
                now={now}
              />

              <SurfaceRule />
              <StatRow>
                <Stat
                  value={fromKilograms(strength.latest.weight, unit).toLocaleString()}
                  unit={unit}
                  label="Latest"
                  size="sm"
                />
                <Stat
                  value={fromKilograms(strength.best.weight, unit).toLocaleString()}
                  unit={unit}
                  label="Best"
                  size="sm"
                />
                <Stat
                  value={`${strength.latest.reps}`}
                  label="Reps, latest"
                  size="sm"
                />
              </StatRow>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {logged.length === 0
                ? "Nothing to plot yet. Log a working set — warm-ups do not count — and the lifts you train show up here."
                : `Nothing logged for this lift in ${RANGE_PHRASES[range]}. Try a longer range.`}
            </p>
          )}
        </Surface>
      </section>

      {/* Deliberately not bounded by the range above it: "last time" is whenever
          it was, and this card going blank because the last squat fell a day
          outside the window would be answering a question nobody asked. */}
      <section aria-label="Last session" className="mt-10">
        <SectionHeader label="Last session" />
        <Surface>
          {selected && topSet ? (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selected.name}</span> ·{" "}
                {dayLabel(topSet.performedAt, now)}
              </p>

              <SurfaceRule />
              <StatRow>
                <Stat
                  value={fromKilograms(topSet.weight, unit).toLocaleString()}
                  unit={unit}
                  label="Top weight"
                  size="sm"
                />
                <Stat value={topSet.setCount} label="Sets at top" size="sm" />
                <Stat value={topSet.totalSets} label="Working sets" size="sm" />
              </StatRow>

              <p className="mt-5 text-xs text-muted-foreground">
                {repsPhrase(topSet)} ·{" "}
                <Link
                  href={`/history/${topSet.workoutSessionId}`}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  See the workout
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing logged yet. The heaviest bar of your last workout lands here.
            </p>
          )}
        </Surface>
      </section>

      <section aria-label="Volume" className="mt-10">
        <SectionHeader label="Volume" />
        <Surface>
          {selected && series && series.total > 0 ? (
            <>
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{selected.name}</span> · reps ×
                  weight, {RANGE_PHRASES[range]}
                </p>
                <SegmentedLinks
                  options={CHART_OPTIONS}
                  value={volumeType}
                  param="volumeChart"
                  query={query}
                  label="Volume chart type"
                  className="shrink-0"
                />
              </div>

              <StatRow>
                <Stat
                  value={Math.round(fromKilograms(series.total, unit)).toLocaleString()}
                  unit={unit}
                  label="Volume"
                  size="sm"
                />
                <Stat value={series.setCount} label="Sets" size="sm" />
                <Stat
                  value={`${series.trained}/${buckets}`}
                  label={`${bucketNoun} trained`}
                  size="sm"
                />
              </StatRow>
              <VolumeChart buckets={series.buckets} range={range} type={volumeType} unit={unit} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {selected
                ? `No working sets of ${selected.name} in ${RANGE_PHRASES[range]}.`
                : `No working sets in ${RANGE_PHRASES[range]}.`}
            </p>
          )}
        </Surface>
      </section>

      <section aria-label="Muscle balance" className="mt-10">
        <SectionHeader label="Muscle balance" />
        <Surface>
          {volume.byMuscleGroup.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to split up yet. Working sets from {RANGE_PHRASES[range]} land here.
            </p>
          ) : (
            <>
              {/* Said out loud because every card above it is one lift, and this
                  one never is. */}
              <p className="mb-4 text-sm text-muted-foreground">
                All training, {RANGE_PHRASES[range]}.
              </p>
              <MuscleRadar groups={volume.byMuscleGroup} unit={unit} />
            </>
          )}
        </Surface>
      </section>

      <section aria-label="Records" className="mt-10">
        <SectionHeader label="Records" />
        <Surface>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to beat yet.</p>
          ) : (
            <RecordsList records={records} unit={unit} />
          )}
        </Surface>
      </section>

      <p className="mt-10 text-center text-sm text-muted-foreground">{footnote(strength, unit)}</p>
    </Screen>
  );
}

/**
 * What the top sets were done for. Spelled out rather than left to the stat
 * row, because "3 sets at 100 kg" is three different sessions depending on
 * whether they were fives or singles.
 */
function repsPhrase({ reps }: TopSet): string {
  if (reps.length === 1) return `Done for ${reps[0]} reps`;
  if (reps.every((count) => count === reps[0])) return `${reps.length} × ${reps[0]} reps`;
  return `Done for ${reps.slice(0, -1).join(", ")} and ${reps[reps.length - 1]} reps`;
}

function footnote(strength: { change: number | null } | null, unit: WeightUnit): string {
  if (!strength || strength.change === null) return "The duck is waiting for a second data point.";
  if (strength.change > 0) {
    return `Up ${Math.round(fromKilograms(strength.change, unit))} ${unit} on the bar. The gorilla nods.`;
  }
  if (strength.change < 0) return "Down a little. The sloth says that is what weeks are for.";
  return "Flat. The frog calls that consistency.";
}
