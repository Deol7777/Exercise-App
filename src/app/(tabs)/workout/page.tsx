import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { WorkoutLogger } from "@/features/training/components/workout-logger";
import type {
  ExerciseSummary,
  LoggedWorkoutSession,
  WorkoutSessionListItem,
} from "@/lib/types/training";
import { listExercises } from "@/server/services/exercises";
import { listRoutinesFor } from "@/server/services/routines";
import {
  getActiveWorkoutSessionDetail,
  listWorkoutSessionsFor,
  type WorkoutSessionDetail,
  type WorkoutSessionSummary,
} from "@/server/services/training";

/**
 * The logging screen's server half: it resolves who is asking, calls the domain
 * services directly (a server component may, as long as it writes no SQL), and
 * hands the result to a client component as plain JSON-shaped props.
 *
 * Timestamps are serialised here so the props match exactly what the REST
 * handlers return — the client then has one shape to understand, not two.
 */
export default async function WorkoutPage() {
  const { userId, unit } = await requireAccount();

  const [detail, catalog, recent, routines] = await Promise.all([
    getActiveWorkoutSessionDetail(userId),
    listExercises(userId),
    listWorkoutSessionsFor(userId, { limit: 5 }),
    listRoutinesFor(userId),
  ]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow={detail ? "In progress" : "Workout"}
        title={detail ? "Today's work" : "Nothing running"}
      />
      <WorkoutLogger
        session={detail && toWireSession(detail)}
        catalog={catalog satisfies ExerciseSummary[]}
        recent={recent.map(toWireSummary)}
        routineCount={routines.length}
        unit={unit}
      />
    </Screen>
  );
}

function toWireSession(detail: WorkoutSessionDetail): LoggedWorkoutSession {
  return {
    ...detail,
    startedAt: detail.startedAt.toISOString(),
    endedAt: detail.endedAt?.toISOString() ?? null,
  };
}

function toWireSummary(summary: WorkoutSessionSummary): WorkoutSessionListItem {
  return {
    ...summary,
    startedAt: summary.startedAt.toISOString(),
    endedAt: summary.endedAt?.toISOString() ?? null,
  };
}