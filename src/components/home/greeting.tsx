"use client";

import { useSyncExternalStore } from "react";

import { zonedDate } from "@/lib/time-zone";

/**
 * GOOD MORNING / AFTERNOON / EVENING, on the app's clock
 * (src/lib/time-zone.ts) rather than the browser's.
 *
 * It stays a client component now only because the greeting should follow the
 * hour rather than the render: a server pass fixes it for the life of the
 * response, and this one re-reads on navigation. Since the hour no longer comes
 * from the viewer's machine, the server could compute it too — worth collapsing
 * to a server component if this ever costs more than it earns.
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
  /**
   * The app's hour, not the browser's. Being told "Good evening" while the log
   * has already rolled the day over is the confusing case, and every other
   * boundary in the app is cut in the same zone.
   */
  const hour = zonedDate(new Date()).hour;
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function serverSnapshot(): string {
  return "Welcome back";
}
