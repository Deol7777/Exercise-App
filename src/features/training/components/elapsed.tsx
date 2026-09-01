"use client";

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDuration, minutesBetween } from "@/lib/format";

/**
 * How long the workout has been running, ticking.
 *
 * Client-side because it has to keep moving — a server-rendered elapsed time is
 * correct once and then quietly wrong for the rest of the session. It renders
 * nothing until the first tick so the server and the first client render agree;
 * the alternative is a hydration mismatch every time the page is not rendered
 * in the same second it is hydrated.
 */
export function Elapsed({ startedAt }: { startedAt: string }) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const started = new Date(startedAt);
    const tick = () => setMinutes(minutesBetween(started, new Date()));

    tick();
    /** A minute counter needs no more than a per-second check to stay honest. */
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <span
      className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground"
      /** Announced on demand, not on every tick. */
      aria-live="off"
    >
      <Timer aria-hidden className="size-4" />
      <span className="tabular">{minutes === null ? "—" : formatDuration(minutes)}</span>
      <span className="sr-only">elapsed</span>
    </span>
  );
}
