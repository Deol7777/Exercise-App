import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { RoutineEditor } from "@/components/routines/routine-editor";
import { plural } from "@/lib/format";
import type { RoutineDetailView } from "@/lib/types/routines";
import type { ExerciseSummary } from "@/lib/types/training";
import { isDomainError } from "@/server/errors";
import { listExercises } from "@/server/services/exercises";
import { getRoutine, type RoutineDetail } from "@/server/services/routines";

export default async function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireAccount();
  const { id } = await params;

  let routine: RoutineDetail;
  try {
    routine = await getRoutine(userId, id);
  } catch (error) {
    /** Someone else's routine is `not_found` in the service, and a 404 here. */
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }

  const catalog = await listExercises(userId);

  return (
    <Screen>
      <ScreenHeader
        eyebrow={
          <Link href="/routines" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft aria-hidden className="size-3.5" />
            Routines
          </Link>
        }
        title={routine.name}
      />
      <p className="-mt-4 mb-8 text-sm text-muted-foreground">
        {plural(routine.exercises.length, "exercise")} · starting this copies them into a new
        workout
      </p>
      <RoutineEditor
        routine={toWireRoutine(routine)}
        catalog={catalog satisfies ExerciseSummary[]}
      />
    </Screen>
  );
}

function toWireRoutine(routine: RoutineDetail): RoutineDetailView {
  return {
    ...routine,
    createdAt: routine.createdAt.toISOString(),
    updatedAt: routine.updatedAt.toISOString(),
  };
}
