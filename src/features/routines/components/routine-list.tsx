"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mascot } from "@/components/ui/mascot";
import { Surface } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/lib/api";
import { plural } from "@/lib/format";
import { queryKeys } from "@/lib/queries";
import type { RoutineListItem } from "@/lib/types/routines";

/**
 * The routines screen.
 *
 * As on the logging screen (ADR 0014), the server component renders the first
 * paint and passes it in as `initialData`; everything after that runs through
 * the query cache.
 *
 * Creating happens here because a routine starts as nothing but a name — the
 * exercises go in on the routine's own page, which is where there is room for
 * them.
 */
export function RoutineList({ initialData }: { initialData: RoutineListItem[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoutineListItem | null>(null);

  const { data: routines } = useQuery({
    queryKey: queryKeys.routines,
    queryFn: () => apiFetch<RoutineListItem[]>("/api/routines"),
    initialData,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<RoutineListItem>("/api/routines", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.routines });
      /**
       * Whether a routine exists is the whole of what `StartRoutineLink` keys
       * on, and that link lives on Home and `/workout` — other tabs, which the
       * router cache may be holding from before this routine existed
       * (`staleTimes.dynamic`). Without this, the first routine someone creates
       * leaves both screens with no way to start it for thirty seconds.
       */
      router.refresh();
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not create that routine."),
  });

  const remove = useMutation({
    mutationFn: (routineId: string) =>
      apiFetch(`/api/routines/${routineId}`, { method: "DELETE" }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.routines });
      /** Deleting the last one takes the link away again. */
      router.refresh();
    },
    onError: (caught: unknown) => {
      setPendingDelete(null);
      setError(caught instanceof ApiError ? caught.message : "Could not delete that routine.");
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <div className="flex flex-col gap-8">
      <Surface>
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
          <Field className="min-w-48 flex-1">
            <FieldLabel htmlFor="routine-name">New routine</FieldLabel>
            <Input
              id="routine-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Push Day"
              maxLength={120}
              autoComplete="off"
            />
          </Field>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Adding…" : "Add"}
          </Button>
        </form>
        {error ? <FieldError>{error}</FieldError> : null}
      </Surface>

      {routines.length === 0 ? (
        <Surface className="flex flex-col items-center gap-4 py-12 text-center">
          <Mascot name="sloth" size="lg" />
          <p className="text-sm text-muted-foreground text-balance">
            No routines yet. Name one above, then fill it with the exercises you always end up
            doing anyway.
          </p>
        </Surface>
      ) : (
        <ul aria-label="Routines" className="flex flex-col gap-4">
          {routines.map((routine) => (
            <li key={routine.id}>
              <Surface className="relative flex items-center gap-4">
                <Mascot seed={routine.id} size="md" className="pointer-events-none size-12" />

                {/* The whole card is the link; the delete button sits above it
                    so it stays a real button rather than a nested one. */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/routines/${routine.id}`}
                    className="after:absolute after:inset-0 after:z-0"
                  >
                    <h2 className="truncate text-xl font-extrabold">{routine.name}</h2>
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {plural(routine.exerciseCount, "exercise")}
                  </p>
                </div>

                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative z-10 shrink-0"
                  aria-label={`Delete ${routine.name}`}
                  onClick={() => setPendingDelete(routine)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </Surface>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
            <DialogDescription>
              The routine and its list of exercises go for good. Workouts you already logged from
              it are untouched — they were copies from the moment you started them.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep it</Button>
            </DialogClose>
            <Button
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
