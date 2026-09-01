/**
 * The shapes the routines API puts on the wire, and therefore the shapes the
 * client works with.
 *
 * As in ./training.ts, these mirror rather than re-export the records in
 * src/server/db/queries/routines.ts: a client component may not import from
 * src/server/**, and a timestamp is a `Date` there and an ISO string here.
 */
import type { MuscleGroup } from "@/lib/muscle-groups";

export type RoutineListItem = {
  id: string;
  name: string;
  notes: string | null;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
  exerciseCount: number;
};

export type RoutineExerciseItem = {
  id: string;
  position: number;
  notes: string | null;
  exercise: { id: string; name: string; muscleGroup: MuscleGroup };
};

export type RoutineDetailView = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseItem[];
};
