/**
 * Query keys, in one place.
 *
 * Two screens' worth of cache is small enough that a typo in a key would simply
 * mean a mutation invalidates nothing and the screen quietly goes stale — the
 * failure is silent, which is why the keys are not written by hand at call
 * sites.
 */
export const queryKeys = {
  /** The workout session in progress, with its exercise entries and sets. */
  activeWorkoutSession: ["workout-sessions", "active"] as const,
  /** The recent-sessions list on the logging screen. */
  workoutSessions: ["workout-sessions", "list"] as const,
};
