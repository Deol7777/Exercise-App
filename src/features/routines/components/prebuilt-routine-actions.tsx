"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PillButton } from "@/components/ui/pill-button";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { RoutineListItem } from "@/lib/types/routines";

/**
 * The two things you can do with a shipped programme, in the order people
 * actually want them.
 *
 * **Start** is the primary action and the point of the screen: it opens a
 * workout with these exercises now, and keeps nothing. Nothing is written to
 * `routines` — the exercises are copied straight into the new workout session,
 * the same copy a routine makes when it is started.
 *
 * **Copy to my routines** is the second, quieter choice: for a programme you
 * intend to run again, and want to rename or edit first. It is a `Button`
 * rather than a second `PillButton` because two pills read as two equal
 * choices, and these are not equal.
 *
 * With a workout already open, Start becomes a link back to it — the service
 * refuses a second session, and a button that can only fail is worse than the
 * door back to the one you left running. Copying is still allowed: it touches
 * no workout.
 */
export function PrebuiltRoutineActions({
  prebuiltId,
  hasActiveSession,
}: {
  prebuiltId: string;
  hasActiveSession: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      apiFetch("/api/workout-sessions", {
        method: "POST",
        body: JSON.stringify({ prebuiltId }),
      }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession });
      /** `/workout` may be cached from when there was no session to show. */
      router.refresh();
      router.push("/workout");
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not start that workout."),
  });

  const copy = useMutation({
    mutationFn: () =>
      apiFetch<RoutineListItem>("/api/routines/prebuilt", {
        method: "POST",
        body: JSON.stringify({ prebuiltId }),
      }),
    onMutate: () => setError(null),
    onSuccess: async (routine) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.routines });
      /** A first routine puts the "Start routine" link on Home and /workout. */
      router.refresh();
      router.push(`/routines/${routine.id}`);
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not copy that routine."),
  });

  const busy = start.isPending || copy.isPending;

  return (
    <div className="flex flex-col gap-3">
      {hasActiveSession ? (
        <PillButton asChild>
          <Link href="/workout">Continue workout</Link>
        </PillButton>
      ) : (
        <PillButton onClick={() => start.mutate()} disabled={busy}>
          {start.isPending ? "Starting…" : "Start routine"}
        </PillButton>
      )}

      <Button type="button" variant="outline" disabled={busy} onClick={() => copy.mutate()}>
        {copy.isPending ? "Copying…" : "Copy to my routines"}
      </Button>

      {error ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
