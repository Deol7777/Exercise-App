"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PillButton } from "@/components/ui/pill-button";

/**
 * Ending a workout turns a half-finished session into history in one tap, and
 * this screen offers no way back — so it asks twice.
 *
 * Reopening is not actually impossible: `editWorkoutSession` takes
 * `endedAt: null` on purpose, so a mis-tap on Finish need not cost a workout.
 * Nothing in the UI reaches that yet, which is the only reason the dialog is
 * worth its interruption. Wire a reopen and this can soften.
 *
 * The question is drawn at random each time the dialog opens rather than at
 * render, because picking during render would differ between the server pass
 * and the client one and trip a hydration mismatch.
 */
const FINISH_PROMPTS = [
  "Done already? The dumbbells were only just warming up.",
  "Calling it here? Your hamstrings have filed a formal complaint.",
  "That's the workout? The bench genuinely did not notice you.",
  "Wrapping up, or is this a strategic retreat?",
  "Shall we tell the weights they're free to go?",
  "Ending the session? Bold, for someone who skipped legs.",
  "Lock it in before you talk yourself into one more set?",
  "So we're finished — should the protein shake get that in writing?",
  "Closing time. Will the squat rack be hearing from you again?",
  "Punching out? The treadmill was starting to like you.",
  "Final answer, or is there one more set hiding in there somewhere?",
  "Sealing this one into history, mediocre reps and all?",
  "Should the mirror stop pretending it didn't see that last set?",
  "Retiring for the day, or merely resting for forty minutes?",
] as const;

export function FinishWorkoutDialog({
  onConfirm,
  disabled = false,
  pending = false,
  /**
   * Nothing has been logged yet, so there is no workout to keep. The control
   * says what it will do — throw the session away — rather than pretending an
   * empty session is a training record.
   */
  abandon = false,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  abandon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<string>(FINISH_PROMPTS[0]);

  function onOpenChange(next: boolean) {
    if (next) setPrompt(FINISH_PROMPTS[Math.floor(Math.random() * FINISH_PROMPTS.length)]);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <PillButton type="button" variant="outline" disabled={disabled}>
          {abandon
            ? pending
              ? "Abandoning…"
              : "Abandon workout"
            : pending
              ? "Finishing…"
              : "Finish workout"}
        </PillButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{abandon ? "Abandon this workout?" : prompt}</DialogTitle>
          <DialogDescription>
            {abandon
              ? "Nothing has been logged, so nothing will be saved. The session disappears as though it never started."
              : "Finishing closes the session for good. Anything you meant to log has to go in now."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{abandon ? "Keep going" : "One more set"}</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {abandon
              ? pending
                ? "Abandoning…"
                : "Throw it away"
              : pending
                ? "Finishing…"
                : "Yeah, I'm done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
