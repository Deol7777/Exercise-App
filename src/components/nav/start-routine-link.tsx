import Link from "next/link";

import { PillButton } from "@/components/ui/pill-button";

/**
 * The door to the routine picker, shown next to the plain "Start workout"
 * button on the home screen and the logging screen.
 *
 * A link rather than a control: choosing a routine is a screen of its own
 * (`/routines/start`), not a dropdown. Nothing is started until a routine is
 * picked there.
 *
 * Renders nothing when the user keeps no routines — a door to an empty room is
 * worse than no door.
 */
export function StartRoutineLink({ routineCount }: { routineCount: number }) {
  if (routineCount === 0) return null;

  return (
    <PillButton asChild variant="outline">
      <Link href="/routines/start">Start routine</Link>
    </PillButton>
  );
}
