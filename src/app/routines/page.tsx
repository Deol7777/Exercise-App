import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { RoutineList } from "@/components/routines/routine-list";
import type { RoutineListItem } from "@/lib/types/routines";
import { listRoutinesFor, type RoutineSummary } from "@/server/services/routines";

/**
 * The routines screen's server half: it resolves who is asking, calls the
 * domain service directly, and hands the result to a client component as plain
 * JSON-shaped props.
 *
 * Timestamps are serialised here so the props match exactly what the REST
 * handlers return — the client then has one shape to understand, not two.
 */
export default async function RoutinesPage() {
  const { userId } = await requireAccount();
  const routines = await listRoutinesFor(userId);

  return (
    <Screen>
      <ScreenHeader eyebrow="Plans" title="Routines" />
      <RoutineList initialData={routines.map(toWireRoutine)} />
    </Screen>
  );
}

function toWireRoutine(routine: RoutineSummary): RoutineListItem {
  return {
    ...routine,
    createdAt: routine.createdAt.toISOString(),
    updatedAt: routine.updatedAt.toISOString(),
  };
}
