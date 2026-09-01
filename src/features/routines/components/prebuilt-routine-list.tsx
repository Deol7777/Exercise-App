import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { SectionHeader } from "@/components/layout/screen";
import { Mascot } from "@/components/ui/mascot";
import { Surface } from "@/components/ui/surface";
import { plural } from "@/lib/format";
import { prebuiltPrograms } from "@/lib/prebuilt-routines";

/**
 * The shipped programmes, grouped by the programme they belong to.
 *
 * A server component with no state and no fetching: prebuilt routines are
 * content in the codebase (src/lib/prebuilt-routines.ts), the same for every
 * account, so there is nothing here for the query cache to hold.
 *
 * Grouped rather than flat because a day means nothing on its own — "Workout A"
 * is only a thing if you can see it is StrongLifts. Tapping one opens it; the
 * copying happens there, where the exercises are visible first.
 */
export function PrebuiltRoutineList() {
  return (
    <div className="flex flex-col gap-8">
      {prebuiltPrograms().map(({ program, routines }) => (
        <section key={program}>
          <SectionHeader label={program} />
          <ul aria-label={program} className="flex flex-col gap-3">
            {routines.map((routine) => (
              <li key={routine.slug}>
                <Surface className="relative flex items-center gap-4">
                  <Mascot seed={routine.slug} size="md" className="pointer-events-none size-12" />

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/routines/prebuilt/${routine.slug}`}
                      className="after:absolute after:inset-0"
                    >
                      <h3 className="truncate text-lg font-extrabold">{routine.day}</h3>
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {plural(routine.exercises.length, "exercise")}
                    </p>
                  </div>

                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
