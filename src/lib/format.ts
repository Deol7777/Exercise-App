/**
 * Presentation-only formatting. Nothing here decides anything — it turns values
 * the services already produced into the strings the references show.
 *
 * Weights are deliberately absent: they convert through src/lib/weight.ts,
 * because a kilogram becoming a pound is a unit decision, not a formatting one.
 */

/** Whole minutes between two instants, floored — 47 min, not 47.4. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/** How long a session ran, or how long it has been running. */
export function sessionMinutes(session: { startedAt: Date; endedAt: Date | null }): number {
  return minutesBetween(session.startedAt, session.endedAt ?? new Date());
}

/**
 * "47 min" up to an hour, "1h 02m" past it. The references never show seconds,
 * and a workout measured to the second is a stopwatch, not a log.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * "Today", "Yesterday", then the weekday for the rest of the past week, then a
 * date. Rendered on the server, so the day boundary is the server's — a session
 * logged just before midnight can read as "Yesterday" to a user several time
 * zones away. Worth fixing when any screen depends on it being exact; the home
 * screen uses it as a caption.
 */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });

  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Large counts lose their last digits: 248,391 → "248k". */
export function compactNumber(value: number): string {
  if (Math.abs(value) < 10_000) return Math.round(value).toLocaleString();
  return `${Math.round(value / 1000).toLocaleString()}k`;
}

/** "1 exercise", "4 sets" — the count and its noun, agreeing. */
export function plural(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
