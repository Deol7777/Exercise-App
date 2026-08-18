"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { LastPerformanceView, LoggedExerciseEntry, LoggedSet } from "@/lib/types/training";
import { addSetSchema, updateSetSchema } from "@/lib/validation/training";

/**
 * One exercise entry and its sets, with the form that logs the next one.
 *
 * The form is the thing that has to be quick — it is used standing at a rack
 * between sets — so it prefills from the previous set of this entry, keeps
 * focus, and never navigates.
 */
export function ExerciseEntryCard({
  entry,
  workoutSessionId,
  onChanged,
}: {
  entry: LoggedExerciseEntry;
  /** Excluded from "last time", so it means the previous session, not this one. */
  workoutSessionId: string;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [lastTime, setLastTime] = useState<LastPerformanceView | null>(null);

  /**
   * What this exercise was done for last time, fetched once per entry. It is a
   * prompt, not state the screen depends on, so a failure is swallowed: the
   * card still logs sets without it.
   */
  useEffect(() => {
    let cancelled = false;

    apiFetch<LastPerformanceView | null>(
      `/api/exercises/${entry.exercise.id}/last-performance?exclude=${workoutSessionId}`,
    )
      .then((result) => {
        if (!cancelled) setLastTime(result);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [entry.exercise.id, workoutSessionId]);

  const lastSet = entry.sets.at(-1);
  const [reps, setReps] = useState(String(lastSet?.reps ?? 8));
  const [weight, setWeight] = useState(String(lastSet?.weight ?? 20));
  const [isWarmup, setIsWarmup] = useState(false);

  async function onAddSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    /** The same schema the handler runs; this pass only saves a round trip. */
    const parsed = addSetSchema.safeParse({
      reps: Number(reps),
      weight: Number(weight),
      isWarmup,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the set.");
      return;
    }

    setPending(true);
    try {
      await apiFetch<LoggedSet>(`/api/exercise-entries/${entry.id}/sets`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setIsWarmup(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not log that set.");
    } finally {
      setPending(false);
    }
  }

  async function onDeleteSet(setId: string) {
    setError(null);
    try {
      await apiFetch(`/api/sets/${setId}`, { method: "DELETE" });
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not remove that set.");
    }
  }

  async function onRemoveEntry() {
    setError(null);
    try {
      await apiFetch(`/api/exercise-entries/${entry.id}`, { method: "DELETE" });
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not remove that exercise.");
    }
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
          <span className="text-muted-foreground text-xs font-normal">
            {MUSCLE_GROUP_LABELS[entry.exercise.muscleGroup]}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lastTime ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            Last time (
            {new Date(lastTime.startedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            ): {lastTime.sets.map((set) => `${set.reps} × ${set.weight}`).join(", ")} kg
          </p>
        ) : null}

        {entry.sets.length ? (
          <ol className="flex flex-col gap-1 text-sm">
            {entry.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                onDelete={() => onDeleteSet(set.id)}
                onSaved={onChanged}
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
            <FieldLabel htmlFor={`weight-${entry.id}`}>Weight (kg)</FieldLabel>
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
          <Button type="submit" disabled={pending} className="mb-0.5">
            {pending ? "Logging…" : "Log set"}
          </Button>
        </form>

        {error ? <FieldError>{error}</FieldError> : null}

        <div className="text-muted-foreground flex items-center justify-between text-xs">
          {/* Warm-up sets are stored but never counted — see docs/glossary.md. */}
          <span>
            {workingSets.length} working {workingSets.length === 1 ? "set" : "sets"} ·{" "}
            {volume.toLocaleString()} kg volume
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemoveEntry}>
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
  onDelete,
  onSaved,
  onError,
}: {
  set: LoggedSet;
  onDelete: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(set.weight));
  const [saving, setSaving] = useState(false);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);

    const parsed = updateSetSchema.safeParse({ reps: Number(reps), weight: Number(weight) });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Check the set.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch<LoggedSet>(`/api/sets/${set.id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      setEditing(false);
      onSaved();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Could not save that set.");
    } finally {
      setSaving(false);
    }
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
          <span className="text-muted-foreground text-xs">kg</span>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setReps(String(set.reps));
              setWeight(String(set.weight));
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
      <span>
        <span className="text-muted-foreground mr-2">{set.position}</span>
        {set.reps} × {set.weight} kg
        {set.isWarmup ? <span className="text-muted-foreground ml-2 text-xs">warm-up</span> : null}
      </span>
      <span className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          aria-label={`Edit set ${set.position}`}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={`Remove set ${set.position}`}
        >
          Remove
        </Button>
      </span>
    </li>
  );
}
