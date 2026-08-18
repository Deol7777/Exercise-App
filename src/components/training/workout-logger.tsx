"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

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
import { queryKeys } from "@/lib/queries";
import type {
  ExerciseSummary,
  LoggedWorkoutSession,
  WorkoutSessionListItem,
} from "@/lib/types/training";
import type { WeightUnit } from "@/lib/weight";

/**
 * The logging screen.
 *
 * The server component renders the first paint and passes its data in as
 * `initialData`; everything after that runs through the query cache (ADR 0014).
 * A mutation invalidates the two keys it can affect rather than refetching the
 * page, so logging a set does not re-render history.
 */
export function WorkoutLogger({
  session: initialSession,
  catalog,
  recent,
  unit,
}: {
  session: LoggedWorkoutSession | null;
  catalog: ExerciseSummary[];
  recent: WorkoutSessionListItem[];
  unit: WeightUnit;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [exerciseId, setExerciseId] = useState<string>("");

  const { data: session } = useQuery({
    queryKey: queryKeys.activeWorkoutSession,
    queryFn: () =>
      apiFetch<LoggedWorkoutSession | null>("/api/workout-sessions?active=true"),
    initialData: initialSession,
  });

  const { data: sessions } = useQuery({
    queryKey: queryKeys.workoutSessions,
    queryFn: () => apiFetch<WorkoutSessionListItem[]>("/api/workout-sessions?limit=5"),
    initialData: recent,
  });

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions }),
    ]);

  /** Shared shape for the mutations that simply refetch afterwards. */
  const mutation = (request: () => Promise<unknown>, fallback: string) => ({
    mutationFn: request,
    onMutate: () => setError(null),
    onSuccess: invalidateAll,
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : fallback),
  });

  const start = useMutation(
    mutation(
      () => apiFetch("/api/workout-sessions", { method: "POST", body: JSON.stringify({}) }),
      "Could not start a workout session.",
    ),
  );

  const finish = useMutation(
    mutation(
      () =>
        apiFetch(`/api/workout-sessions/${session?.id}`, {
          method: "PATCH",
          body: JSON.stringify({ endedAt: new Date().toISOString() }),
        }),
      "Could not finish the workout session.",
    ),
  );

  const addExercise = useMutation({
    ...mutation(
      () =>
        apiFetch(`/api/workout-sessions/${session?.id}/exercises`, {
          method: "POST",
          body: JSON.stringify({ exerciseId }),
        }),
      "Could not add that exercise.",
    ),
    onSuccess: async () => {
      setExerciseId("");
      await invalidateAll();
    },
  });

  /**
   * Moving one entry is expressed as the whole new running order, because that
   * is what the endpoint takes — the server derives positions 1..n from it.
   */
  const reorder = useMutation({
    mutationFn: (order: string[]) =>
      apiFetch(`/api/workout-sessions/${session?.id}/exercises`, {
        method: "PATCH",
        body: JSON.stringify({ order }),
      }),
    /** Optimistic: the cards move under the thumb, not after a round trip. */
    onMutate: async (order: string[]) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.activeWorkoutSession });

      const previous = queryClient.getQueryData<LoggedWorkoutSession | null>(
        queryKeys.activeWorkoutSession,
      );

      queryClient.setQueryData<LoggedWorkoutSession | null>(
        queryKeys.activeWorkoutSession,
        (current) =>
          current
            ? {
                ...current,
                exercises: order.flatMap((id, index) => {
                  const entry = current.exercises.find((candidate) => candidate.id === id);
                  return entry ? [{ ...entry, position: index + 1 }] : [];
                }),
              }
            : current,
      );

      return { previous };
    },
    onError: (caught, _order, context) => {
      queryClient.setQueryData(queryKeys.activeWorkoutSession, context?.previous);
      setError(caught instanceof ApiError ? caught.message : "Could not reorder the exercises.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession }),
  });

  const busy = start.isPending || finish.isPending || addExercise.isPending;

  function onMove(entryId: string, direction: -1 | 1) {
    if (!session) return;

    const order = session.exercises.map((entry) => entry.id);
    const from = order.indexOf(entryId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;

    [order[from], order[to]] = [order[to], order[from]];
    reorder.mutate(order);
  }

  function onAddExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session && exerciseId) addExercise.mutate();
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
            <Button onClick={() => start.mutate()} disabled={busy} className="w-fit">
              {start.isPending ? "Starting…" : "Start workout"}
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
          </CardContent>
        </Card>
        <RecentSessions sessions={sessions} />
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
            <Button type="submit" disabled={!exerciseId || busy}>
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => finish.mutate()}
              disabled={busy}
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

      <RecentSessions sessions={sessions} />
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
