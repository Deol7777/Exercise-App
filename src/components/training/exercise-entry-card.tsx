"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { queryKeys } from "@/lib/queries";
import type {
  LastPerformanceView,
  LoggedExerciseEntry,
  LoggedSet,
  LoggedWorkoutSession,
} from "@/lib/types/training";
import { formatVolume, fromKilograms, toKilograms, type WeightUnit } from "@/lib/weight";
import { addSetSchema, updateSetSchema } from "@/lib/validation/training";

/** Marks a set that exists only in the cache so far. */
const PENDING_PREFIX = "pending-";

/**
 * One exercise entry and its sets, with the form that logs the next one.
 *
 * Logging a set is the one interaction that has to feel instant — it happens
 * standing at a rack, between sets, on gym wifi — so it is optimistic: the set
 * appears in the cached session immediately and is rolled back if the request
 * fails (ADR 0014).
 */
export function ExerciseEntryCard({
  entry,
  workoutSessionId,
  unit,
  onMoveUp,
  onMoveDown,
}: {
  entry: LoggedExerciseEntry;
  /** Excluded from "last time", so it means the previous session, not this one. */
  workoutSessionId: string;
  /** Display unit. Everything below is kilograms until it is rendered. */
  unit: WeightUnit;
  /** Undefined at the ends of the list, which is what disables the control. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const lastSet = entry.sets.at(-1);
  const [reps, setReps] = useState(String(lastSet?.reps ?? 8));
  const [weight, setWeight] = useState(
    String(lastSet ? fromKilograms(lastSet.weight, unit) : unit === "kg" ? 20 : 45),
  );
  const [isWarmup, setIsWarmup] = useState(false);

  /**
   * What this exercise was done for last time. A prompt, not state the screen
   * depends on, so a failure is silent: the card still logs sets without it.
   */
  const { data: lastTime } = useQuery({
    queryKey: ["last-performance", entry.exercise.id, workoutSessionId],
    queryFn: () =>
      apiFetch<LastPerformanceView | null>(
        `/api/exercises/${entry.exercise.id}/last-performance?exclude=${workoutSessionId}`,
      ),
    staleTime: Infinity,
    retry: false,
  });

  /** Rewrites this entry's sets inside the cached session, and hands back a rollback. */
  function patchCachedSets(update: (sets: LoggedSet[]) => LoggedSet[]) {
    const previous = queryClient.getQueryData<LoggedWorkoutSession | null>(
      queryKeys.activeWorkoutSession,
    );

    queryClient.setQueryData<LoggedWorkoutSession | null>(
      queryKeys.activeWorkoutSession,
      (current) =>
        current
          ? {
              ...current,
              exercises: current.exercises.map((candidate) =>
                candidate.id === entry.id ? { ...candidate, sets: update(candidate.sets) } : candidate,
              ),
            }
          : current,
    );

    return previous;
  }

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession });
    void queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
  };

  const rollback = (previous: LoggedWorkoutSession | null | undefined, message: string) => {
    queryClient.setQueryData(queryKeys.activeWorkoutSession, previous);
    setError(message);
  };

  const logSet = useMutation({
    mutationFn: (input: { reps: number; weight: number; isWarmup: boolean }) =>
      apiFetch<LoggedSet>(`/api/exercise-entries/${entry.id}/sets`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.activeWorkoutSession });

      /**
       * A placeholder id, replaced when the refetch brings the real row. The
       * `pending-` prefix is what the row renders as "saving…": an optimistic
       * set that looks identical to a saved one invites navigating away before
       * the write lands.
       */
      const optimistic: LoggedSet = {
        id: `${PENDING_PREFIX}${Date.now()}`,
        position: (entry.sets.at(-1)?.position ?? 0) + 1,
        ...input,
      };

      return { previous: patchCachedSets((sets) => [...sets, optimistic]) };
    },
    onSuccess: () => setIsWarmup(false),
    onError: (caught, _input, context) =>
      rollback(
        context?.previous,
        caught instanceof ApiError ? caught.message : "Could not log that set.",
      ),
    onSettled: settle,
  });

  const removeSet = useMutation({
    mutationFn: (setId: string) => apiFetch(`/api/sets/${setId}`, { method: "DELETE" }),
    onMutate: async (setId: string) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.activeWorkoutSession });
      return { previous: patchCachedSets((sets) => sets.filter((set) => set.id !== setId)) };
    },
    onError: (caught, _setId, context) =>
      rollback(
        context?.previous,
        caught instanceof ApiError ? caught.message : "Could not remove that set.",
      ),
    onSettled: settle,
  });

  const removeEntry = useMutation({
    mutationFn: () => apiFetch(`/api/exercise-entries/${entry.id}`, { method: "DELETE" }),
    onMutate: () => setError(null),
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : "Could not remove that exercise."),
    onSettled: settle,
  });

  function onAddSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    /** The unit edge: what was typed becomes kilograms exactly here. */
    const parsed = addSetSchema.safeParse({
      reps: Number(reps),
      weight: toKilograms(Number(weight), unit),
      isWarmup,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the set.");
      return;
    }

    logSet.mutate({ ...parsed.data, isWarmup: parsed.data.isWarmup ?? false });
  }

  const workingSets = entry.sets.filter((set) => !set.isWarmup);
  const volume = workingSets.reduce((total, set) => total + set.reps * set.weight, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>
            {entry.position}. {entry.exercise.name}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs font-normal">
              {MUSCLE_GROUP_LABELS[entry.exercise.muscleGroup]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!onMoveUp}
              onClick={onMoveUp}
              aria-label={`Move ${entry.exercise.name} up`}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!onMoveDown}
              onClick={onMoveDown}
              aria-label={`Move ${entry.exercise.name} down`}
            >
              ↓
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lastTime ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            Last time (
            {new Date(lastTime.startedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            ):{" "}
            {lastTime.sets
              .map((set) => `${set.reps} × ${fromKilograms(set.weight, unit)}`)
              .join(", ")}{" "}
            {unit}
          </p>
        ) : null}

        {entry.sets.length ? (
          <ol className="flex flex-col gap-1 text-sm">
            {entry.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                unit={unit}
                onDelete={() => removeSet.mutate(set.id)}
                onSaved={settle}
                onOptimistic={patchCachedSets}
                onRollback={rollback}
                onError={setError}
              />
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">No sets yet.</p>
        )}

        <form onSubmit={onAddSet} className="flex flex-wrap items-end gap-3">
          <Field className="w-20">
            <FieldLabel htmlFor={`reps-${entry.id}`}>Reps</FieldLabel>
            <Input
              id={`reps-${entry.id}`}
              inputMode="numeric"
              value={reps}
              onChange={(event) => setReps(event.target.value)}
              required
            />
          </Field>
          <Field className="w-28">
            <FieldLabel htmlFor={`weight-${entry.id}`}>Weight ({unit})</FieldLabel>
            <Input
              id={`weight-${entry.id}`}
              inputMode="decimal"
              step="0.5"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              required
            />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={isWarmup}
              onChange={(event) => setIsWarmup(event.target.checked)}
            />
            Warm-up
          </label>
          <Button type="submit" className="mb-0.5">
            Log set
          </Button>
        </form>

        {error ? <FieldError>{error}</FieldError> : null}

        <div className="text-muted-foreground flex items-center justify-between text-xs">
          {/* Warm-up sets are stored but never counted — see docs/glossary.md. */}
          <span>
            {workingSets.length} working {workingSets.length === 1 ? "set" : "sets"} ·{" "}
            {formatVolume(volume, unit)} volume
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry.mutate()}>
            Remove exercise
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One logged set: read-only until "Edit", then two inputs and a save. A typo in
 * the weight is the thing this exists for — noticing it two sets later should
 * not mean deleting and re-logging.
 */
function SetRow({
  set,
  unit,
  onDelete,
  onSaved,
  onOptimistic,
  onRollback,
  onError,
}: {
  set: LoggedSet;
  unit: WeightUnit;
  onDelete: () => void;
  onSaved: () => void;
  onOptimistic: (update: (sets: LoggedSet[]) => LoggedSet[]) => LoggedWorkoutSession | null | undefined;
  onRollback: (previous: LoggedWorkoutSession | null | undefined, message: string) => void;
  onError: (message: string | null) => void;
}) {
  /**
   * Two ways a row can be unsaved: it was just logged and exists only in the
   * cache, or an edit to it is still in flight. Both show "saving…", because
   * both mean navigating away now loses the change.
   */
  const optimistic = set.id.startsWith(PENDING_PREFIX);
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(fromKilograms(set.weight, unit)));

  const save = useMutation({
    mutationFn: (input: { reps: number; weight: number }) =>
      apiFetch<LoggedSet>(`/api/sets/${set.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onMutate: (input) => {
      onError(null);
      setEditing(false);
      return {
        previous: onOptimistic((sets) =>
          sets.map((candidate) =>
            candidate.id === set.id ? { ...candidate, ...input } : candidate,
          ),
        ),
      };
    },
    onError: (caught, _input, context) => {
      setEditing(true);
      onRollback(
        context?.previous,
        caught instanceof ApiError ? caught.message : "Could not save that set.",
      );
    },
    onSettled: onSaved,
  });

  const pending = optimistic || save.isPending;

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = updateSetSchema.safeParse({
      reps: Number(reps),
      weight: toKilograms(Number(weight), unit),
    });

    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Check the set.");
      return;
    }

    save.mutate({ reps: parsed.data.reps!, weight: parsed.data.weight! });
  }

  if (editing) {
    return (
      <li>
        <form onSubmit={onSave} className="flex flex-wrap items-center gap-2">
          <Input
            className="w-16"
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            aria-label={`Reps for set ${set.position}`}
          />
          <span className="text-muted-foreground">×</span>
          <Input
            className="w-20"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            aria-label={`Weight for set ${set.position}`}
          />
          <span className="text-muted-foreground text-xs">{unit}</span>
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setReps(String(set.reps));
              setWeight(String(fromKilograms(set.weight, unit)));
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 tabular-nums">
      <span className={pending ? "text-muted-foreground" : undefined}>
        <span className="text-muted-foreground mr-2">{set.position}</span>
        {set.reps} × {fromKilograms(set.weight, unit)} {unit}
        {set.isWarmup ? <span className="text-muted-foreground ml-2 text-xs">warm-up</span> : null}
        {pending ? <span className="ml-2 text-xs">saving…</span> : null}
      </span>
      <span className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setEditing(true)}
          aria-label={`Edit set ${set.position}`}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onDelete}
          aria-label={`Remove set ${set.position}`}
        >
          Remove
        </Button>
      </span>
    </li>
  );
}
