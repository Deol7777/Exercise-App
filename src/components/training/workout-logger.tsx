"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { StartRoutineLink } from "@/components/routines/start-routine-link";
import { ExerciseEntryCard } from "@/components/training/exercise-entry-card";
import { FinishWorkoutDialog } from "@/components/training/finish-workout-dialog";
import { Button } from "@/components/ui/button";
import { PillButton } from "@/components/ui/pill-button";
import { Stat, StatRow } from "@/components/ui/stat";
import { Surface, SurfaceRule } from "@/components/ui/surface";
import { SectionHeader } from "@/components/layout/screen";
import { formatDuration, minutesBetween } from "@/lib/format";
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
import { APP_TIME_ZONE } from "@/lib/time-zone";
import type {
  ExerciseSummary,
  LoggedExerciseEntry,
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
  routineCount,
  unit,
}: {
  session: LoggedWorkoutSession | null;
  catalog: ExerciseSummary[];
  recent: WorkoutSessionListItem[];
  routineCount: number;
  unit: WeightUnit;
}) {
  const router = useRouter();
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

  /**
   * Picking an exercise is the start of logging it, not a filing action — so
   * this goes straight to the stepper for the entry it just created, rather
   * than adding a card to a list the person then has to find and tap.
   */
  const addExercise = useMutation({
    /** Written out rather than through `mutation()`, which erases the result type. */
    mutationFn: () =>
      apiFetch<LoggedExerciseEntry>(`/api/workout-sessions/${session?.id}/exercises`, {
        method: "POST",
        body: JSON.stringify({ exerciseId }),
      }),
    onMutate: () => setError(null),
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not add that exercise."),
    onSuccess: async (entry) => {
      setExerciseId("");
      await invalidateAll();
      router.push(`/log/${entry.id}`);
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
      <div className="flex flex-col gap-8">
        <Surface>
          <h2 className="text-2xl font-extrabold">No workout in progress</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start one, then add the exercises as you do them.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <PillButton onClick={() => start.mutate()} disabled={busy}>
              {start.isPending ? "Starting…" : "Start workout"}
            </PillButton>
            <StartRoutineLink routineCount={routineCount} />
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        </Surface>
        <RecentSessions sessions={sessions} />
      </div>
    );
  }

  const workingSets = session.exercises.flatMap((entry) =>
    entry.sets.filter((set) => !set.isWarmup),
  );

  return (
    <div className="flex flex-col gap-8">
      <Surface>
        <p className="label-caps">Workout in progress</p>
        <SurfaceRule className="my-4" />
        <StatRow>
          <Stat value={session.exercises.length} label="Exercises" size="sm" />
          <Stat value={workingSets.length} label="Sets" size="sm" />
          <Stat
            value={formatDuration(minutesBetween(new Date(session.startedAt), new Date()))}
            label="Elapsed"
            size="sm"
          />
        </StatRow>
      </Surface>

      <Surface>
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
          </form>
          {error ? <FieldError>{error}</FieldError> : null}
      </Surface>

      <FinishWorkoutDialog
        onConfirm={() => finish.mutate()}
        disabled={busy}
        pending={finish.isPending}
      />

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
    <section>
      <SectionHeader label="Recent sessions" />
      <Surface>
        <ul className="flex flex-col gap-3 text-sm">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-4">
              <span>
                {new Date(session.startedAt).toLocaleDateString(undefined, {
                  dateStyle: "medium",
                  timeZone: APP_TIME_ZONE,
                })}
                {session.endedAt ? "" : " · in progress"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {session.exerciseCount} exercises · {session.setCount} sets
              </span>
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}
