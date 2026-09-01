import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAccount } from "@/app/_lib/require-account";
import { Screen, ScreenHeader, SectionHeader } from "@/components/layout/screen";
import { PrebuiltRoutineActions } from "@/features/routines/components/prebuilt-routine-actions";
import { Surface, Well } from "@/components/ui/surface";
import { plural } from "@/lib/format";
import { findPrebuiltRoutine } from "@/lib/prebuilt-routines";
import { getActiveWorkoutSession } from "@/server/services/training";

/**
 * One shipped programme's day: what is in it, and the button that copies it.
 *
 * The programme itself is static content, but the screen still calls
 * `requireAccount()`: the tab bar is a layout with no guard of its own, so
 * without it a signed-out visitor gets a tab bar and two buttons that can only
 * 401. The one thing it reads from the database is whether a workout is already
 * running, which decides what the primary button says.
 *
 * The exercises come before the buttons because both actions are decisions
 * about the list, not the name.
 *
 * `prebuilt` is a static segment and wins over the sibling `[id]`, exactly as
 * `start` does. It is not prerendered either: the tab layout reads the session
 * to resolve the theme, which makes every route under it request-rendered.
 */
export default async function PrebuiltRoutinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await requireAccount();
  const { slug } = await params;
  const routine = findPrebuiltRoutine(slug);
  if (!routine) notFound();

  /** Only to choose between "Start routine" and the way back to an open one. */
  const active = await getActiveWorkoutSession(userId);

  return (
    <Screen>
      <ScreenHeader
        eyebrow={
          <Link
            href="/routines?tab=prebuilt"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            {routine.program}
          </Link>
        }
        title={routine.day}
      />
      <p className="-mt-4 mb-8 text-sm text-muted-foreground text-balance">{routine.blurb}</p>

      <section className="mb-8">
        <SectionHeader label={plural(routine.exercises.length, "exercise")} />
        <ol aria-label={`Exercises in ${routine.day}`} className="flex flex-col gap-3">
          {routine.exercises.map((line, index) => (
            /* Neither the movement nor the prescription is unique on its own —
               5/3/1 does the same lift twice at two schemes — so the position
               is what keys the row. */
            <li key={`${line.exercise}-${index}`}>
              <Surface inset="sm" className="flex items-center gap-3">
                <Well size="sm" className="shrink-0 text-sm font-bold tabular-nums">
                  {index + 1}
                </Well>
                <p className="min-w-0 flex-1 truncate font-semibold">{line.exercise}</p>
                <p className="shrink-0 text-sm text-muted-foreground tabular-nums">{line.scheme}</p>
              </Surface>
            </li>
          ))}
        </ol>
      </section>

      <PrebuiltRoutineActions prebuiltId={routine.slug} hasActiveSession={active !== null} />
      <p className="mt-3 text-center text-xs text-muted-foreground text-balance">
        Starting keeps nothing — the exercises are copied into the workout. Copy it to your
        routines to keep it and edit it.
      </p>
    </Screen>
  );
}
