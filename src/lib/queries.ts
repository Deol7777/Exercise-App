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
  /** Every routine this user keeps, with a count of what is in each. */
  routines: ["routines", "list"] as const,
  /**
   * One routine and its exercises. The file's only factory: this cache really
   * is per-id, and a single flat key would have two routine pages overwrite
   * each other.
   */
  routine: (routineId: string) => ["routines", "detail", routineId] as const,
};
