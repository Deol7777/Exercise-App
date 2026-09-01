import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { RoutineStartList } from "@/features/routines/components/routine-start-list";
import { Mascot } from "@/components/ui/mascot";
import { Surface } from "@/components/ui/surface";
import type { RoutineListItem } from "@/lib/types/routines";
import { listRoutinesFor, type RoutineSummary } from "@/server/services/routines";
import { getActiveWorkoutSession } from "@/server/services/training";

/**
 * Pick a routine to start.
 *
 * A screen rather than a dropdown: this is the moment the workout is chosen,
 * and it deserves the width of the page.
 *
 * `start` is a static segment and wins over the sibling `[id]`, so it can never
 * be shadowed by a routine — routine ids are UUIDs in any case.
 */
export default async function StartRoutinePage() {
  const { userId } = await requireAccount();

  const [routines, active] = await Promise.all([
    listRoutinesFor(userId),
    getActiveWorkoutSession(userId),
  ]);

  /**
   * Only one workout session may be in progress, so with one already open there
   * is nothing to pick — the service would refuse every card on this page.
   */
  if (active) redirect("/workout");

  return (
    <Screen>
      <ScreenHeader
        eyebrow={
          <Link href="/routines" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft aria-hidden className="size-3.5" />
            Routines
          </Link>
        }
        title="Start one"
      />

      {routines.length === 0 ? (
        <Surface className="flex flex-col items-center gap-4 py-12 text-center">
          <Mascot name="sloth" size="lg" />
          <p className="text-sm text-muted-foreground text-balance">
            Nothing to start yet.{" "}
            <Link href="/routines" className="underline underline-offset-4">
              Build a routine
            </Link>{" "}
            and it will be waiting here.
          </p>
        </Surface>
      ) : (
        <RoutineStartList routines={routines.map(toWireRoutine)} />
      )}
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
