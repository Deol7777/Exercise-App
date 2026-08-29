"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Mascot } from "@/components/ui/mascot";
import { Surface } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/lib/api";
import { plural } from "@/lib/format";
import { queryKeys } from "@/lib/queries";
import type { RoutineListItem } from "@/lib/types/routines";

/**
 * Pick a routine, and the workout starts.
 *
 * Each card is one tap — there is no select-then-confirm, because arriving on
 * this screen was already the confirmation. The whole card is the button, so
 * the target is the size of the card rather than the size of a word.
 *
 * It posts a `routineId` to the same `/api/workout-sessions` the plain start
 * button uses, so both paths go through the identical one-open-session guard.
 * The routine's exercises are copied into the new session; nothing links them
 * afterwards.
 */
export function RoutineStartList({ routines }: { routines: RoutineListItem[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: (routineId: string) =>
      apiFetch("/api/workout-sessions", {
        method: "POST",
        body: JSON.stringify({ routineId }),
      }),
    onMutate: (routineId: string) => {
      setError(null);
      setStartingId(routineId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession });
      /** As on the home button: drop the cached, session-less `/log` first. */
      router.refresh();
      router.push("/log");
    },
    onError: (caught: unknown) => {
      setStartingId(null);
      setError(caught instanceof ApiError ? caught.message : "Could not start that routine.");
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul aria-label="Routines to start" className="flex flex-col gap-4">
        {routines.map((routine) => (
          <li key={routine.id}>
            <button
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate(routine.id)}
              className="w-full text-left disabled:opacity-60"
            >
              <Surface className="flex items-center gap-4 transition-colors hover:bg-secondary/40">
                <Mascot seed={routine.id} size="md" className="pointer-events-none size-12" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-extrabold">{routine.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {startingId === routine.id
                      ? "Starting…"
                      : plural(routine.exerciseCount, "exercise")}
                  </p>
                </div>
              </Surface>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
