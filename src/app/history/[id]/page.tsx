import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { currentUserId } from "@/server/auth";
import { isDomainError } from "@/server/errors";
import { getWorkoutSession, type WorkoutSessionDetail } from "@/server/services/training";

/**
 * One workout session, read-only. A session belonging to somebody else throws
 * `NotFoundError` in the service and becomes Next's 404 here — the same answer
 * the API gives, for the same reason.
 */
export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

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
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {session.startedAt.toLocaleDateString(undefined, { dateStyle: "long" })}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/history">History</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {volume.toLocaleString()} kg · {workingSets.length} working sets
          </CardTitle>
          <CardDescription>
            Started{" "}
            {session.startedAt.toLocaleTimeString(undefined, { timeStyle: "short" })}
            {minutes === null ? " · still in progress" : ` · ${minutes} minutes`}
          </CardDescription>
        </CardHeader>
        {session.notes ? (
          <CardContent>
            <p className="text-sm">{session.notes}</p>
          </CardContent>
        ) : null}
      </Card>

      {session.exercises.map((entry) => (
        <Card key={entry.id}>
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between gap-2">
              <span>
                {entry.position}. {entry.exercise.name}
              </span>
              <span className="text-muted-foreground text-xs font-normal">
                {MUSCLE_GROUP_LABELS[entry.exercise.muscleGroup]}
              </span>
            </CardTitle>
            {entry.notes ? <CardDescription>{entry.notes}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm tabular-nums">
              {entry.sets.map((set) => (
                <li key={set.id}>
                  <span className="text-muted-foreground mr-2">{set.position}</span>
                  {set.reps} × {set.weight} kg
                  {set.isWarmup ? (
                    <span className="text-muted-foreground ml-2 text-xs">warm-up</span>
                  ) : null}
                </li>
              ))}
              {entry.sets.length === 0 ? (
                <li className="text-muted-foreground">No sets logged.</li>
              ) : null}
            </ol>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
