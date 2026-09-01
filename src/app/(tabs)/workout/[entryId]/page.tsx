import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAccount } from "@/app/_lib/require-account";
import { Screen } from "@/components/layout/screen";
import { BackToWorkout } from "@/features/training/components/back-to-workout";
import { ExerciseStepper } from "@/features/training/components/exercise-stepper";
import { Elapsed } from "@/features/training/components/elapsed";
import { RestClock } from "@/features/training/components/rest-clock";
import { ExerciseIcon } from "@/components/ui/exercise-icon";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { LoggedWorkoutSession } from "@/lib/types/training";
import { isDomainError } from "@/server/errors";
import { getLastPerformance } from "@/server/services/progress";
import {
  getExerciseEntry,
  getWorkoutSession,
  type ExerciseEntryDetail,
} from "@/server/services/training";

/**
 * Logging one exercise: the stepper, the sets so far, and where this sits in
 * the session (references/image copy 2.png).
 *
 * The screen is for a workout that is still running. A finished session is
 * history, not something to add to, so it redirects to the read-only view
 * rather than offering controls that would reopen it by accident.
 */
export default async function ExerciseEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { userId, unit } = await requireAccount();
  const { entryId } = await params;

  let detail: ExerciseEntryDetail;
  try {
    detail = await getExerciseEntry(userId, entryId);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }

  if (detail.session.endedAt) redirect(`/history/${detail.session.id}`);

  const { entry, session, index, total, previousEntryId, nextEntryId } = detail;

  /**
   * What this exercise looked like last time, so the stepper opens on a real
   * weight. The session in progress is excluded, or "last time" would mean the
   * set logged ninety seconds ago.
   */
  const lastTime = await getLastPerformance(userId, entry.exercise.id, {
    excludeWorkoutSessionId: session.id,
  });
  const seed = lastTime?.sets.at(-1) ?? null;

  /** The stepper reads the same cache the list screen does, so it is handed the whole session. */
  const wireSession = toWireSession(await getWorkoutSession(userId, session.id));

  return (
    <Screen className="pt-6">
      <header className="flex items-center justify-between gap-3">
        <BackToWorkout entryId={entry.id} session={wireSession} />
        <p className="label-caps text-center">
          Exercise {index} of {total}
        </p>
        <Elapsed startedAt={session.startedAt.toISOString()} />
      </header>

      <div className="relative mt-6 mb-8">
        <h1 className="max-w-[9ch] text-[2.25rem] leading-[1.05] font-extrabold uppercase">
          {entry.exercise.name}
        </h1>
        <p className="label-caps mt-2">{MUSCLE_GROUP_LABELS[entry.exercise.muscleGroup]}</p>
        <ExerciseIcon
          name={entry.exercise.name}
          seed={entry.exercise.id}
          className="pointer-events-none absolute right-0 -bottom-2 h-24 w-24"
        />
      </div>

      <RestClock />

      <ExerciseStepper entryId={entry.id} unit={unit} session={wireSession} seed={seed} />

      {previousEntryId || nextEntryId ? (
        <nav aria-label="Exercises in this workout" className="mt-8 flex gap-3">
          <PagerLink href={previousEntryId && `/workout/${previousEntryId}`} direction="previous" />
          <PagerLink href={nextEntryId && `/workout/${nextEntryId}`} direction="next" />
        </nav>
      ) : null}
    </Screen>
  );
}

/**
 * The ends of the running order are rendered as disabled rather than removed,
 * so the two controls do not swap places as you page through the session.
 */
function PagerLink({
  href,
  direction,
}: {
  href: string | null;
  direction: "previous" | "next";
}) {
  const label = direction === "previous" ? "Previous" : "Next";
  const icon =
    direction === "previous" ? (
      <ChevronLeft aria-hidden className="size-4" />
    ) : (
      <ChevronRight aria-hidden className="size-4" />
    );

  const className =
    "flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-medium transition-colors";

  if (!href) {
    return (
      <span aria-hidden className={`${className} bg-card/50 text-muted-foreground/40`}>
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </span>
    );
  }

  return (
    <Link href={href} className={`${className} bg-card hover:bg-secondary`}>
      {direction === "previous" ? icon : null}
      {label}
      {direction === "next" ? icon : null}
    </Link>
  );
}

function toWireSession(detail: Awaited<ReturnType<typeof getWorkoutSession>>): LoggedWorkoutSession {
  return {
    ...detail,
    startedAt: detail.startedAt.toISOString(),
    endedAt: detail.endedAt?.toISOString() ?? null,
  };
}
