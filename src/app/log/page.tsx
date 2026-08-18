import { redirect } from "next/navigation";
import Link from "next/link";

import { WorkoutLogger } from "@/components/training/workout-logger";
import { Button } from "@/components/ui/button";
import type {
  ExerciseSummary,
  LoggedWorkoutSession,
  WorkoutSessionListItem,
} from "@/lib/types/training";
import { currentUserId } from "@/server/auth";
import { listExercises } from "@/server/services/exercises";
import {
  getActiveWorkoutSession,
  getWorkoutSession,
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
export default async function LogPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  const active = await getActiveWorkoutSession(userId);
  const [detail, catalog, recent] = await Promise.all([
    active ? getWorkoutSession(userId, active.id) : Promise.resolve(null),
    listExercises(userId),
    listWorkoutSessionsFor(userId, { limit: 5 }),
  ]);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Log</h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Home</Link>
        </Button>
      </header>

      <WorkoutLogger
        session={detail && toWireSession(detail)}
        catalog={catalog satisfies ExerciseSummary[]}
        recent={recent.map(toWireSummary)}
      />
    </main>
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
