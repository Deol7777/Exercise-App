"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ExerciseIcon } from "@/components/ui/exercise-icon";
import { FieldError } from "@/components/ui/field";
import { Surface, Well } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/lib/api";
import { plural } from "@/lib/format";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { queryKeys } from "@/lib/queries";
import type { LastPerformanceView, LoggedExerciseEntry } from "@/lib/types/training";
import { formatVolume, fromKilograms, type WeightUnit } from "@/lib/weight";

/**
 * One exercise entry on the logging screen, as a summary you tap into.
 *
 * The sets are logged on the stepper screen (`/log/[entryId]`), not here. This
 * card used to carry its own reps/weight form, which meant two surfaces could
 * write a set and the screen was a wall of inputs. Now the whole card is the
 * way in, and the only controls it keeps are the ones about the entry itself:
 * where it sits in the order, and whether it belongs in the workout at all.
 */
export function ExerciseEntryCard({
  entry,
  workoutSessionId,
  unit,
  onMoveUp,
  onMoveDown,
}: {
  entry: LoggedExerciseEntry;
  workoutSessionId: string;
  unit: WeightUnit;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  /** What this exercise looked like last time, as a target to beat. */
  const { data: lastTime } = useQuery({
    queryKey: ["last-performance", entry.exercise.id, workoutSessionId],
    queryFn: () =>
      apiFetch<LastPerformanceView | null>(
        `/api/exercises/${entry.exercise.id}/last-performance?exclude=${workoutSessionId}`,
      ),
    staleTime: Infinity,
  });

  const removeEntry = useMutation({
    mutationFn: () => apiFetch(`/api/exercise-entries/${entry.id}`, { method: "DELETE" }),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession }),
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not remove that exercise."),
  });

  const workingSets = entry.sets.filter((set) => !set.isWarmup);
  const volume = workingSets.reduce((total, set) => total + set.reps * set.weight, 0);

  return (
    <Surface className="relative">
      {/*
        The link is stretched over the card rather than wrapping it, so the
        reorder and remove controls can stay real buttons. A button inside an
        anchor is invalid markup, and unusable besides: every tap meant for
        "move down" would navigate instead.
      */}
      <Link
        href={`/log/${entry.id}`}
        aria-label={`Log ${entry.exercise.name}`}
        className="absolute inset-0 z-0 rounded-[var(--radius-surface)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      {/* Pointer events off so the stretched link underneath receives the tap. */}
      <div className="pointer-events-none relative z-10 flex items-start gap-4">
        <Well>
          <ExerciseIcon
            name={entry.exercise.name}
            seed={entry.exercise.id}
            className="h-10 w-10"
          />
        </Well>
        <div className="min-w-0 flex-1">
          <h3 className="font-display flex items-center gap-1 text-base font-bold">
            <span className="min-w-0 truncate">
              {entry.position}. {entry.exercise.name}
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </h3>
          <p className="label-caps mt-1">{MUSCLE_GROUP_LABELS[entry.exercise.muscleGroup]}</p>

          {entry.sets.length ? (
            <ul className="tabular mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {entry.sets.map((set) => (
                <li key={set.id} className={set.isWarmup ? "text-muted-foreground" : undefined}>
                  {set.reps} × {fromKilograms(set.weight, unit)} {unit}
                  {set.isWarmup ? " (warm-up)" : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No sets yet.</p>
          )}

          {lastTime && lastTime.sets.length ? (
            <p className="tabular mt-2 text-xs text-muted-foreground">
              Last time:{" "}
              {lastTime.sets
                .map((set) => `${set.reps} × ${fromKilograms(set.weight, unit)}`)
                .join(", ")}{" "}
              {unit}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {/* Warm-up sets are stored but never counted — see docs/glossary.md. */}
        <span>
          {plural(workingSets.length, "working set")} · {formatVolume(volume, unit)} volume
        </span>
        <span className="flex items-center gap-1">
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
          <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry.mutate()}>
            Remove exercise
          </Button>
        </span>
      </div>

      {error ? (
        <div className="relative z-10 mt-2">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </Surface>
  );
}
