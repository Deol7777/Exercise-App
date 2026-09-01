"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StartRoutineLink } from "@/components/nav/start-routine-link";
import { PillButton } from "@/components/ui/pill-button";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

/**
 * The home screen's call to action. Starting a workout is a mutation, and there
 * are no Server Actions here (ADR 0003), so it posts to the route handler and
 * then goes to the logging screen.
 *
 * With a session already in progress this is a plain link instead — the service
 * refuses a second one, and offering a button that can only fail is worse than
 * offering the door back to the workout you left open. The routine link is
 * hidden for the same reason.
 */
export function StartWorkoutButton({
  hasActiveSession,
  trainedToday = false,
  routineCount = 0,
}: {
  hasActiveSession: boolean;
  /** Finished one already today — starting another is allowed, just not the assumption. */
  trainedToday?: boolean;
  /** Zero renders no routine link; the count is all this needs to know. */
  routineCount?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      apiFetch("/api/workout-sessions", { method: "POST", body: JSON.stringify({}) }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession });
      /**
       * `/workout` may already be sitting in the router cache from a moment ago
       * (`staleTimes.dynamic`), rendered when there was no session to show.
       * Refresh before the push or the new workout arrives at an empty screen.
       */
      router.refresh();
      router.push("/workout");
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not start a workout."),
  });

  if (hasActiveSession) {
    return (
      <PillButton asChild>
        <Link href="/workout">Continue workout</Link>
      </PillButton>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <PillButton
        onClick={() => start.mutate()}
        disabled={start.isPending}
        variant={trainedToday ? "outline" : "primary"}
      >
        {start.isPending ? "Starting…" : trainedToday ? "Start another" : "Start workout"}
      </PillButton>
      {error ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <StartRoutineLink routineCount={routineCount} />
    </div>
  );
}
