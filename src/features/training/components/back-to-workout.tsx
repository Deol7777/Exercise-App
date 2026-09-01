"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { LoggedWorkoutSession } from "@/lib/types/training";

/**
 * The back control on the exercise screen.
 *
 * An entry with no sets is a picker mis-tap, not a performance — leaving it
 * behind means the workout lists an exercise that never happened. So going back
 * from an empty entry deletes it. Anything with a set on it is left alone.
 *
 * It reads the same `activeWorkoutSession` cache the stepper writes (ADR 0014),
 * so a set logged a moment ago counts even before the refetch lands.
 */
export function BackToWorkout({
  entryId,
  session: initialSession,
}: {
  entryId: string;
  session: LoggedWorkoutSession;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: queryKeys.activeWorkoutSession,
    queryFn: () => apiFetch<LoggedWorkoutSession | null>("/api/workout-sessions?active=true"),
    initialData: initialSession,
  });

  const entry = session?.exercises.find((candidate) => candidate.id === entryId);
  const isEmpty = entry ? entry.sets.length === 0 : false;

  const leave = useMutation({
    mutationFn: async () => {
      if (isEmpty) await apiFetch(`/api/exercise-entries/${entryId}`, { method: "DELETE" });
    },
    /** A failed delete is not worth blocking the way out: go back either way. */
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions }),
      ]);
      router.push("/workout");
      router.refresh();
    },
  });

  return (
    <button
      type="button"
      aria-label="Back to the workout"
      disabled={leave.isPending}
      onClick={() => leave.mutate()}
      className="flex size-10 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-60"
    >
      <ChevronLeft aria-hidden className="size-5" />
    </button>
  );
}
