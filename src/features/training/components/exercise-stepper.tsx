"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";

import { PillButton } from "@/components/ui/pill-button";
import { Surface } from "@/components/ui/surface";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { LoggedSet, LoggedWorkoutSession } from "@/lib/types/training";
import { cn } from "@/lib/utils";
import { fromKilograms, toKilograms, type WeightUnit } from "@/lib/weight";

/**
 * One exercise, logged set by set — the screen in references/image copy 2.png.
 *
 * The stepper exists because logging happens mid-set, one-handed, with a bar in
 * the other hand: a plate at a time on a target the thumb cannot miss, rather
 * than a keyboard and a decimal point.
 *
 * It reads the same `activeWorkoutSession` cache the list screen writes
 * (ADR 0014), so a set logged here is on the list before the request lands, and
 * the two screens can never disagree.
 */
export function ExerciseStepper({
  entryId,
  unit,
  session: initialSession,
  /** The last set of this exercise last time, to open on rather than at zero. */
  seed,
}: {
  entryId: string;
  unit: WeightUnit;
  session: LoggedWorkoutSession;
  seed: { reps: number; weight: number } | null;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  /** The set being corrected, or null while composing a new one. */
  const [editing, setEditing] = useState<LoggedSet | null>(null);

  const { data: session } = useQuery({
    queryKey: queryKeys.activeWorkoutSession,
    queryFn: () => apiFetch<LoggedWorkoutSession | null>("/api/workout-sessions?active=true"),
    initialData: initialSession,
  });

  const entry = session?.exercises.find((candidate) => candidate.id === entryId);
  const sets = entry?.sets ?? [];

  /**
   * Opening values: the set just logged, else the seed from last time, else a
   * bare bar. Held in the display unit — every conversion happens at this edge.
   */
  const opening = sets.at(-1) ?? seed ?? { reps: 8, weight: 20 };
  /**
   * Held as text, not numbers: the fields are typable, and a half-typed "1" on
   * the way to "185" must not be snapped to 1 while the thumb is still moving.
   * Parsing happens where the value is used.
   */
  const [weight, setWeight] = useState(() => String(fromKilograms(opening.weight, unit)));
  const [reps, setReps] = useState(() => String(opening.reps));

  const weightValue = Math.max(0, round(Number(weight)));
  const repsValue = Math.max(1, Math.round(Number(reps)));

  /**
   * A blank or half-typed field is not a zero. Coercing it would log a 0 kg set
   * without saying so — and 0 is a legitimate weight here (a dip, a pull-up),
   * so it cannot be used as the "nothing entered" signal.
   */
  const weightEntered = isNumeric(weight);
  const repsEntered = isNumeric(reps) && Number(reps) >= 1;
  const canSubmit = weightEntered && repsEntered;

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkoutSession }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions }),
    ]);

  const logSet = useMutation({
    mutationFn: () =>
      apiFetch(`/api/exercise-entries/${entryId}/sets`, {
        method: "POST",
        body: JSON.stringify({ reps: repsValue, weight: toKilograms(weightValue, unit) }),
      }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not log that set."),
  });

  const updateSet = useMutation({
    mutationFn: (setId: string) =>
      apiFetch(`/api/sets/${setId}`, {
        method: "PATCH",
        body: JSON.stringify({ reps: repsValue, weight: toKilograms(weightValue, unit) }),
      }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not save that set."),
  });

  const removeSet = useMutation({
    mutationFn: (setId: string) => apiFetch(`/api/sets/${setId}`, { method: "DELETE" }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : "Could not remove that set."),
  });

  const busy = logSet.isPending || updateSet.isPending || removeSet.isPending;
  const blocked = busy || !canSubmit;

  /** Plates come in fives in pounds and 2.5s in kilograms; the bar is the floor. */
  const weightStep = unit === "lb" ? 5 : 2.5;

  function selectForEditing(set: LoggedSet) {
    setEditing(set);
    setWeight(String(fromKilograms(set.weight, unit)));
    setReps(String(set.reps));
  }

  function cancelEditing() {
    setEditing(null);
    const last = sets.at(-1) ?? seed ?? { reps: 8, weight: 20 };
    setWeight(String(fromKilograms(last.weight, unit)));
    setReps(String(last.reps));
  }

  return (
    <>
      <Surface inset="sm" className="grid grid-cols-2 gap-3">
        <Stepper
          label={`Weight (${unit})`}
          value={weight}
          onText={setWeight}
          onStep={(direction) =>
            setWeight(String(Math.max(0, round(weightValue + direction * weightStep))))
          }
          inputMode="decimal"
        />
        <Stepper
          label="Reps"
          value={reps}
          onText={setReps}
          onStep={(direction) => setReps(String(Math.max(1, repsValue + direction)))}
          inputMode="numeric"
        />
      </Surface>

      <Surface inset="none" className="mt-4 overflow-hidden">
        {sets.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No sets yet. The first one is the hardest to start.
          </p>
        ) : (
          <ol>
            {sets.map((set, position) => {
              const selected = editing?.id === set.id;

              return (
                <li key={set.id}>
                  <button
                    type="button"
                    onClick={() => (selected ? cancelEditing() : selectForEditing(set))}
                    aria-label={`Set ${position + 1}`}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center gap-4 px-6 py-4 text-left transition-colors",
                      position > 0 && "border-t border-border",
                      selected ? "bg-secondary" : "hover:bg-secondary/50",
                    )}
                  >
                    <span className="label-caps w-16 shrink-0">Set {position + 1}</span>
                    <span className="tabular font-display flex-1 text-base font-bold">
                      {fromKilograms(set.weight, unit)} {unit} × {set.reps}
                      {set.isWarmup ? (
                        <span className="ml-2 text-xs font-medium text-muted-foreground">
                          warm-up
                        </span>
                      ) : null}
                    </span>
                    <Check
                      aria-hidden
                      className={cn(
                        "size-5 shrink-0",
                        selected ? "text-foreground" : "text-brand",
                      )}
                      strokeWidth={2.5}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Surface>

      {/*
        "Complete set" sticks above the tab bar, because logging is what this
        screen is for and it must stay under the thumb however many sets are
        already listed.

        Correcting one does not stick: those controls are three rows tall, and
        pinned they would cover the very set being corrected.
      */}
      <div
        className={cn(
          "z-40 mt-6 flex flex-col gap-3",
          !editing && [
            "sticky pt-6 pb-1",
            "bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))]",
            "bg-gradient-to-t from-background via-background via-70% to-transparent",
          ],
        )}
      >
        {editing ? (
          <>
            <PillButton
              variant="confirm"
              disabled={blocked}
              onClick={() => updateSet.mutate(editing.id)}
            >
              {updateSet.isPending ? "Saving…" : "Update set"}
            </PillButton>
            <div className="flex gap-3">
              <PillButton variant="outline" size="sm" disabled={busy} onClick={cancelEditing}>
                Cancel
              </PillButton>
              <PillButton
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => removeSet.mutate(editing.id)}
                className="text-destructive"
              >
                {removeSet.isPending ? "Removing…" : "Delete set"}
              </PillButton>
            </div>
          </>
        ) : (
          <PillButton variant="confirm" disabled={blocked} onClick={() => logSet.mutate()}>
            {logSet.isPending ? "Saving…" : "Complete set"}
          </PillButton>
        )}

        {!canSubmit ? (
          <p className="text-center text-sm text-muted-foreground">
            {weightEntered ? "Reps must be at least 1." : "Enter a weight."}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * One labelled number with a minus and a plus.
 *
 * The number is also an input, which is not decoration: the buttons move a
 * plate at a time, so reaching 80 kg from an opening 20 would be twenty-four
 * taps. Nudging is what the buttons are for; arriving somewhere new is what
 * typing is for.
 */
function Stepper({
  label,
  value,
  onText,
  onStep,
  inputMode,
}: {
  label: string;
  value: string;
  onText: (next: string) => void;
  onStep: (direction: 1 | -1) => void;
  inputMode: "decimal" | "numeric";
}) {
  /** "Weight (kg)" is a fine label and an invalid id — ids hold no spaces. */
  const id = `stepper-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`;

  return (
    <div className="rounded-[1.25rem] bg-secondary p-4 text-center">
      <label className="label-caps block" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onText(sanitize(event.target.value, inputMode))}
        autoComplete="off"
        onFocus={(event) => event.target.select()}
        inputMode={inputMode}
        /** `text`, not `number`: no browser spinners next to our own. */
        type="text"
        className={cn(
          "tabular font-display mt-2 block w-full bg-transparent text-center",
          "text-[2.5rem] leading-none font-extrabold outline-none",
          "focus-visible:rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      />
      <div className="mt-4 flex gap-2">
        <StepButton label={`Decrease ${label}`} onClick={() => onStep(-1)}>
          <Minus aria-hidden className="size-5" strokeWidth={2.5} />
        </StepButton>
        <StepButton label={`Increase ${label}`} onClick={() => onStep(1)}>
          <Plus aria-hidden className="size-5" strokeWidth={2.5} />
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-12 flex-1 items-center justify-center rounded-full border border-border bg-card",
        "transition-[background-color,transform] active:scale-95 hover:bg-secondary",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {children}
    </button>
  );
}

/** Two decimal places, matching what `numeric(6, 2)` will keep. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A complete number, not a blank field or a lone decimal point. */
function isNumeric(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

/**
 * Keeps a field numeric as it is typed.
 *
 * The inputs are `type="text"` so no browser paints its own spinners beside
 * our buttons, which means nothing stops a letter — or a pasted word — landing
 * in the field. Reps take digits only; weight takes digits and one decimal
 * point, to the two places the column stores. Neither takes a sign: a negative
 * weight is not a thing, and `sets_weight_not_negative` would reject it anyway.
 */
function sanitize(raw: string, mode: "decimal" | "numeric"): string {
  if (mode === "numeric") return raw.replace(/[^0-9]/g, "");

  const [whole, ...rest] = raw.replace(/[^0-9.]/g, "").split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}
