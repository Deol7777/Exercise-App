import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { ExerciseIcon } from "@/components/ui/exercise-icon";
import { Stat, StatRow } from "@/components/ui/stat";
import { Surface, SurfaceRule } from "@/components/ui/surface";
import { dayLabel, formatDuration, plural } from "@/lib/format";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { fromKilograms } from "@/lib/weight";
import { isDomainError } from "@/server/errors";
import { getWorkoutSession, type WorkoutSessionDetail } from "@/server/services/training";

/**
 * One workout session, read-only. A session belonging to somebody else throws
 * `NotFoundError` in the service and becomes Next's 404 here — the same answer
 * the API gives, for the same reason.
 *
 * Where the calendar and the recent list both land, so it is on `Screen` like
 * everything else rather than the wider column it used to keep: a set list read
 * at arm's length is the same width as a set list being written.
 */
export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, unit } = await requireAccount();
  const { id } = await params;

  let session: WorkoutSessionDetail;
  try {
    session = await getWorkoutSession(userId, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }

  const workingSets = session.exercises.flatMap((entry) =>
    entry.sets.filter((set) => !set.isWarmup),
  );
  const volume = workingSets.reduce((total, set) => total + set.reps * set.weight, 0);
  const minutes = session.endedAt
    ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000)
    : null;

  return (
    <Screen>
      <ScreenHeader
        eyebrow={
          <Link href="/history" className="transition-colors hover:text-foreground">
            ← History
          </Link>
        }
        title={dayLabel(session.startedAt)}
      />

      <Surface>
        <p className="text-sm text-muted-foreground">
          Started {session.startedAt.toLocaleTimeString(undefined, { timeStyle: "short" })}
          {minutes === null ? " · still running" : null}
        </p>
        <SurfaceRule />
        <StatRow>
          <Stat
            value={Math.round(fromKilograms(volume, unit)).toLocaleString()}
            unit={unit}
            label="Volume"
          />
          <Stat value={workingSets.length} label="Sets" />
          <Stat
            value={minutes === null ? "—" : formatDuration(minutes)}
            label={minutes === null ? "Running" : "Time"}
          />
        </StatRow>
        {session.notes ? (
          <>
            <SurfaceRule />
            <p className="text-sm">{session.notes}</p>
          </>
        ) : null}
      </Surface>

      <section className="mt-10 flex flex-col gap-3">
        {session.exercises.map((entry) => (
          <Surface key={entry.id} inset="sm">
            <div className="flex items-start gap-3">
              <ExerciseIcon
                name={entry.exercise.name}
                seed={entry.exercise.id}
                className="size-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-display truncate text-lg font-extrabold">
                  {entry.exercise.name}
                </h2>
                <p className="label-caps mt-0.5">
                  {MUSCLE_GROUP_LABELS[entry.exercise.muscleGroup]}
                </p>
              </div>
            </div>

            {entry.notes ? (
              <p className="mt-3 text-sm text-muted-foreground">{entry.notes}</p>
            ) : null}

            {/* The set list is the record, so it stays a numbered list rather
                than becoming a grid — `position` is what the log promises. */}
            <ol className="tabular mt-3 flex flex-col gap-1 text-sm">
              {entry.sets.map((set) => (
                <li key={set.id} className="flex items-baseline gap-2">
                  <span className="w-4 shrink-0 text-muted-foreground">{set.position}</span>
                  <span className="font-semibold">
                    {set.reps} × {fromKilograms(set.weight, unit)}
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                      {unit}
                    </span>
                  </span>
                  {set.isWarmup ? (
                    <span className="label-caps text-muted-foreground">warm-up</span>
                  ) : null}
                </li>
              ))}
              {entry.sets.length === 0 ? (
                <li className="text-muted-foreground">No sets logged.</li>
              ) : null}
            </ol>
          </Surface>
        ))}

        {session.exercises.length === 0 ? (
          <Surface className="text-sm text-muted-foreground">
            {plural(0, "exercise")} on this one. It was started and left alone.
          </Surface>
        ) : null}
      </section>
    </Screen>
  );
}
