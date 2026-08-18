"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { LoggedExerciseEntry, LoggedSet } from "@/lib/types/training";
import { addSetSchema } from "@/lib/validation/training";

/**
 * One exercise entry and its sets, with the form that logs the next one.
 *
 * The form is the thing that has to be quick — it is used standing at a rack
 * between sets — so it prefills from the previous set of this entry, keeps
 * focus, and never navigates.
 */
export function ExerciseEntryCard({
  entry,
  onChanged,
}: {
  entry: LoggedExerciseEntry;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        {entry.sets.length ? (
          <ol className="flex flex-col gap-1 text-sm">
            {entry.sets.map((set) => (
              <li key={set.id} className="flex items-center justify-between gap-2 tabular-nums">
                <span>
                  <span className="text-muted-foreground mr-2">{set.position}</span>
                  {set.reps} × {set.weight} kg
                  {set.isWarmup ? (
                    <span className="text-muted-foreground ml-2 text-xs">warm-up</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteSet(set.id)}
                  aria-label={`Remove set ${set.position}`}
                >
                  Remove
                </Button>
              </li>
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
