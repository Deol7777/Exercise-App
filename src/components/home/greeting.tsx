"use client";

import { useSyncExternalStore } from "react";

/**
 * GOOD MORNING / AFTERNOON / EVENING, from the *user's* clock.
 *
 * This is a client component for one reason: the server renders in the
 * database's timezone (UTC), so a server-rendered greeting tells a user in
 * Vancouver "good evening" over breakfast.
 *
 * `useSyncExternalStore` rather than an effect, because it takes a separate
 * server snapshot: the server and the first client render both produce the
 * neutral fallback, so hydration matches, and the real greeting appears
 * immediately after without a second render pass writing state.
 */
export function Greeting() {
  const greeting = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  return <>{greeting}</>;
}

/** The hour of day is not a store that emits; nothing ever needs re-reading. */
const subscribe = () => () => {};

function clientSnapshot(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function serverSnapshot(): string {
  return "Welcome back";
}
