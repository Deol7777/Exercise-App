import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { formatVolume, fromKilograms } from "@/lib/weight";
import { requireAccount } from "@/app/_lib/require-account";
import { DEFAULT_WEEKS, getPersonalRecords, getWeeklyVolume } from "@/server/services/progress";

/**
 * Progress: the heaviest working set per exercise, and how much work each
 * muscle group has taken week by week. Both come from the service layer — a
 * server component may call one, but never queries the database itself.
 */
export default async function ProgressPage() {
  const { userId, unit } = await requireAccount();

  const [records, volume] = await Promise.all([
    getPersonalRecords(userId),
    getWeeklyVolume(userId, DEFAULT_WEEKS),
  ]);

  /** One row per (week, muscle group) arrives; the page wants it grouped by week. */
  const weeks = [...new Map(volume.map((point) => [point.week.getTime(), point.week])).values()];
  const heaviestWeek = Math.max(
    ...weeks.map((week) =>
      volume
        .filter((point) => point.week.getTime() === week.getTime())
        .reduce((total, point) => total + point.volume, 0),
    ),
    1,
  );

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <nav className="flex gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/log">Log</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/history">History</Link>
          </Button>
        </nav>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Volume by week</CardTitle>
          <CardDescription>
            Working sets only, last {DEFAULT_WEEKS} weeks. Warm-ups are not counted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {weeks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No working sets in this window.</p>
          ) : (
            weeks.map((week) => {
              const points = volume.filter((point) => point.week.getTime() === week.getTime());
              const total = points.reduce((sum, point) => sum + point.volume, 0);

              return (
                <div key={week.toISOString()} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      Week of {week.toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatVolume(total, unit)}
                    </span>
                  </div>
                  {/* Bars are shares of the heaviest week, so weeks are comparable to each other. */}
                  <div className="bg-muted flex h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full"
                      style={{ width: `${(total / heaviestWeek) * 100}%` }}
                    />
                  </div>
                  <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                    {points.map((point) => (
                      <li key={point.muscleGroup}>
                        {MUSCLE_GROUP_LABELS[point.muscleGroup]}{" "}
                        {formatVolume(point.volume, unit)} · {point.setCount} sets
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal records</CardTitle>
          <CardDescription>The heaviest working set recorded for each exercise.</CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing to beat yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {records.map((record) => (
                <li key={record.exerciseId} className="flex items-baseline justify-between gap-4">
                  <span>{record.exerciseName}</span>
                  <span className="tabular-nums">
                    {fromKilograms(record.weight, unit)} {unit} × {record.reps}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {record.achievedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
