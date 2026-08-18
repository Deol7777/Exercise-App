"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { ExerciseEntryCard } from "@/components/training/exercise-entry-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import type { WeightUnit } from "@/lib/weight";
import type {
  ExerciseSummary,
  LoggedWorkoutSession,
  WorkoutSessionListItem,
} from "@/lib/types/training";

/**
 * The logging screen.
 *
 * Server data arrives as props from src/app/log/page.tsx; every change is a
 * REST call followed by router.refresh(), which re-runs the server component
 * and hands this one the new state. There is no client cache to keep in step —
 * TanStack Query is the planned next step, not what this does today.
 */
export function WorkoutLogger({
  session,
  catalog,
  recent,
  unit,
}: {
  session: LoggedWorkoutSession | null;
  catalog: ExerciseSummary[];
  recent: WorkoutSessionListItem[];
  unit: WeightUnit;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [exerciseId, setExerciseId] = useState<string>("");

  const refresh = () => startRefresh(() => router.refresh());

  async function run(work: () => Promise<unknown>, fallback: string) {
    setError(null);
    setPending(true);
    try {
      await work();
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : fallback);
    } finally {
      setPending(false);
    }
  }

  const onStart = () =>
    run(
      () => apiFetch("/api/workout-sessions", { method: "POST", body: JSON.stringify({}) }),
      "Could not start a workout session.",
    );

  const onFinish = () =>
    run(
      () =>
        apiFetch(`/api/workout-sessions/${session?.id}`, {
          method: "PATCH",
          body: JSON.stringify({ endedAt: new Date().toISOString() }),
        }),
      "Could not finish the workout session.",
    );

  /**
   * Moving one entry is expressed as the whole new running order, because that
   * is what the endpoint takes — the server derives positions 1..n from it.
   */
  function onMove(entryId: string, direction: -1 | 1) {
    if (!session) return;

    const order = session.exercises.map((entry) => entry.id);
    const from = order.indexOf(entryId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;

    [order[from], order[to]] = [order[to], order[from]];

    run(
      () =>
        apiFetch(`/api/workout-sessions/${session.id}/exercises`, {
          method: "PATCH",
          body: JSON.stringify({ order }),
        }),
      "Could not reorder the exercises.",
    );
  }

  function onAddExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !exerciseId) return;

    run(async () => {
      await apiFetch(`/api/workout-sessions/${session.id}/exercises`, {
        method: "POST",
        body: JSON.stringify({ exerciseId }),
      });
      setExerciseId("");
    }, "Could not add that exercise.");
  }

  /** Grouped so a 60-row catalog is scannable; the value sent is always the id. */
  const byMuscleGroup = MUSCLE_GROUPS.map((group) => ({
    group,
    items: catalog.filter((exercise) => exercise.muscleGroup === group),
  })).filter(({ items }) => items.length > 0);

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>No workout in progress</CardTitle>
            <CardDescription>Start one, then add the exercises as you do them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={onStart} disabled={pending || refreshing} className="w-fit">
              {pending ? "Starting…" : "Start workout"}
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
          </CardContent>
        </Card>
        <RecentSessions sessions={recent} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Workout in progress</CardTitle>
          <CardDescription>
            Started{" "}
            {new Date(session.startedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={onAddExercise} className="flex flex-wrap items-end gap-3">
            <Field className="w-72">
              <FieldLabel htmlFor="exercise">Add an exercise</FieldLabel>
              <Select value={exerciseId} onValueChange={setExerciseId}>
                <SelectTrigger id="exercise" className="w-full">
                  <SelectValue placeholder="Pick an exercise" />
                </SelectTrigger>
                <SelectContent>
                  {byMuscleGroup.map(({ group, items }) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{MUSCLE_GROUP_LABELS[group]}</SelectLabel>
                      {items.map((exercise) => (
                        <SelectItem key={exercise.id} value={exercise.id}>
                          {exercise.name}
                          {exercise.isCustom ? " ·  yours" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" disabled={!exerciseId || pending || refreshing}>
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onFinish}
              disabled={pending || refreshing}
              className="ml-auto"
            >
              Finish workout
            </Button>
          </form>
          {error ? <FieldError>{error}</FieldError> : null}
        </CardContent>
      </Card>

      {session.exercises.map((entry, index) => (
        <ExerciseEntryCard
          key={entry.id}
          entry={entry}
          workoutSessionId={session.id}
          unit={unit}
          onChanged={refresh}
          onMoveUp={index === 0 ? undefined : () => onMove(entry.id, -1)}
          onMoveDown={
            index === session.exercises.length - 1 ? undefined : () => onMove(entry.id, 1)
          }
        />
      ))}

      {session.exercises.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing logged yet. Add the first exercise above.
        </p>
      ) : null}

      <RecentSessions sessions={recent} />
    </div>
  );
}

function RecentSessions({ sessions }: { sessions: WorkoutSessionListItem[] }) {
  if (sessions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-4">
              <span>
                {new Date(session.startedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                {session.endedAt ? "" : " · in progress"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {session.exerciseCount} exercises · {session.setCount} sets
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
