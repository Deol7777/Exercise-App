import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAccount } from "@/app/_lib/require-account";
import { listWorkoutSessionsFor } from "@/server/services/training";

/** The log read back: every workout session this user has recorded, newest first. */
export default async function HistoryPage() {
  const { userId } = await requireAccount();

  const sessions = await listWorkoutSessionsFor(userId, { limit: 50 });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">History</h1>
        <nav className="flex gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/log">Log</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/progress">Progress</Link>
          </Button>
        </nav>
      </header>

      {sessions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing logged yet</CardTitle>
            <CardDescription>
              <Link href="/log" className="underline underline-offset-4">
                Start a workout
              </Link>{" "}
              and it will show up here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/history/${session.id}`}
                className="hover:bg-accent flex items-center justify-between gap-4 rounded-md border p-4 text-sm transition-colors"
              >
                <span className="font-medium">
                  {session.startedAt.toLocaleDateString(undefined, { dateStyle: "full" })}
                  {session.endedAt ? null : (
                    <span className="text-muted-foreground ml-2 text-xs">in progress</span>
                  )}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {session.exerciseCount} exercises · {session.setCount} sets
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
