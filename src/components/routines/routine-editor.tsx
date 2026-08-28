"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SectionHeader } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface, Well } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/lib/api";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { queryKeys } from "@/lib/queries";
import type { RoutineDetailView } from "@/lib/types/routines";
import type { ExerciseSummary } from "@/lib/types/training";

/**
 * One routine: its name, and the exercises in it, in order.
 *
 * Editing here changes the *plan* only. A workout already started from this
 * routine copied its exercises at the time and is not reachable from anything
 * on this screen.
 */
export function RoutineEditor({
  routine: initialRoutine,
  catalog,
}: {
  routine: RoutineDetailView;
  catalog: ExerciseSummary[];
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [name, setName] = useState(initialRoutine.name);

  const { data: routine } = useQuery({
    queryKey: queryKeys.routine(initialRoutine.id),
    queryFn: () => apiFetch<RoutineDetailView>(`/api/routines/${initialRoutine.id}`),
    initialData: initialRoutine,
  });

  /** The list count on /routines moves whenever what is in a routine does. */
  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.routine(routine.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.routines }),
    ]);

  /** Shared shape for the mutations that simply refetch afterwards. */
  const mutation = (request: () => Promise<unknown>, fallback: string) => ({
    mutationFn: request,
    onMutate: () => setError(null),
    onSuccess: invalidateAll,
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : fallback),
  });

  const rename = useMutation(
    mutation(
      () =>
        apiFetch(`/api/routines/${routine.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() }),
        }),
      "Could not rename the routine.",
    ),
  );

  const addExercise = useMutation(
    mutation(
      () =>
        apiFetch(`/api/routines/${routine.id}/exercises`, {
          method: "POST",
          body: JSON.stringify({ exerciseId }),
        }),
      "Could not add that exercise.",
    ),
  );

  const remove = useMutation({
    mutationFn: (routineExerciseId: string) =>
      apiFetch(`/api/routine-exercises/${routineExerciseId}`, { method: "DELETE" }),
    onMutate: () => setError(null),
    onSuccess: invalidateAll,
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not remove that exercise."),
  });

  /**
   * Moving one exercise is expressed as the whole new running order, because
   * that is what the endpoint takes — the server derives positions 1..n from it.
   */
  const reorder = useMutation({
    mutationFn: (order: string[]) =>
      apiFetch(`/api/routines/${routine.id}/exercises`, {
        method: "PATCH",
        body: JSON.stringify({ order }),
      }),
    /** Optimistic: the rows move under the thumb, not after a round trip. */
    onMutate: async (order: string[]) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.routine(routine.id) });

      const previous = queryClient.getQueryData<RoutineDetailView>(queryKeys.routine(routine.id));

      queryClient.setQueryData<RoutineDetailView>(queryKeys.routine(routine.id), (current) =>
        current
          ? {
              ...current,
              exercises: order.flatMap((id, index) => {
                const line = current.exercises.find((candidate) => candidate.id === id);
                return line ? [{ ...line, position: index + 1 }] : [];
              }),
            }
          : current,
      );

      return { previous };
    },
    onError: (caught, _order, context) => {
      queryClient.setQueryData(queryKeys.routine(routine.id), context?.previous);
      setError(caught instanceof ApiError ? caught.message : "Could not reorder the exercises.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.routine(routine.id) }),
  });

  const busy = rename.isPending || addExercise.isPending || remove.isPending;

  function onMove(routineExerciseId: string, direction: -1 | 1) {
    const order = routine.exercises.map((line) => line.id);
    const from = order.indexOf(routineExerciseId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;

    [order[from], order[to]] = [order[to], order[from]];
    reorder.mutate(order);
  }

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && name.trim() !== routine.name) rename.mutate();
  }

  function onAddExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exerciseId) {
      addExercise.mutate(undefined, { onSuccess: () => setExerciseId("") });
    }
  }

  /** Grouped so a 70-row catalog is scannable; the value sent is always the id. */
  const byMuscleGroup = MUSCLE_GROUPS.map((group) => ({
    group,
    items: catalog.filter((exercise) => exercise.muscleGroup === group),
  })).filter(({ items }) => items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <Surface>
        <form onSubmit={onRename} className="flex flex-wrap items-end gap-3">
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="routine-name">Name</FieldLabel>
            <Input
              id="routine-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
          <Button type="submit" disabled={busy || !name.trim() || name.trim() === routine.name}>
            {rename.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Surface>

      <Surface>
        <form onSubmit={onAddExercise} className="flex flex-wrap items-end gap-3">
          <Field className="min-w-48 flex-1">
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
            {addExercise.isPending ? "Adding…" : "Add"}
          </Button>
        </form>
        {error ? <FieldError>{error}</FieldError> : null}
      </Surface>

      <section>
        <SectionHeader label="In this routine" />
        {routine.exercises.length === 0 ? (
          <Surface className="text-sm text-muted-foreground">
            Nothing in it yet. Add the exercises above, in the order you do them.
          </Surface>
        ) : (
          <ol aria-label="Exercises in this routine" className="flex flex-col gap-3">
            {routine.exercises.map((line, index) => (
              <li key={line.id}>
                <Surface inset="sm" className="flex items-center gap-3">
                  <Well size="sm" className="shrink-0 text-sm font-bold tabular-nums">
                    {index + 1}
                  </Well>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{line.exercise.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {MUSCLE_GROUP_LABELS[line.exercise.muscleGroup]}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Move ${line.exercise.name} up`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => onMove(line.id, -1)}
                  >
                    <ChevronUp aria-hidden className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Move ${line.exercise.name} down`}
                    disabled={index === routine.exercises.length - 1 || reorder.isPending}
                    onClick={() => onMove(line.id, 1)}
                  >
                    <ChevronDown aria-hidden className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Remove ${line.exercise.name}`}
                    disabled={busy}
                    onClick={() => remove.mutate(line.id)}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                </Surface>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
