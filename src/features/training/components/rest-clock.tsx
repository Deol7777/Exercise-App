"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The clock that sits on the exercise screen: a countdown for rest between
 * sets, or a stopwatch for the work itself (a carry, a plank, an EMOM).
 *
 * Both are kept alive at once and the segmented control only chooses which one
 * is on screen — switching mid-rest to glance at a stopwatch must not throw the
 * rest away. Neither counts by adding to a number on every tick: the interval
 * only asks what time it is, and elapsed is derived from a start timestamp plus
 * whatever earlier runs accumulated. A backgrounded tab throttles timers to
 * roughly once a second or stops them altogether, and a counter that increments
 * itself would come back from the pocket minutes light.
 */

/** Rest presets, in seconds — the three that cover almost every set. */
const PRESETS = [60, 90, 120, 180] as const;
const DEFAULT_DURATION = 90;
/** What one tap of the adjusters is worth. */
const NUDGE = 15;

type Mode = "timer" | "stopwatch";

export function RestClock() {
  const [mode, setMode] = useState<Mode>("timer");

  return (
    <section aria-label="Rest clock" className="mb-6">
      <ModeSwitch mode={mode} onMode={setMode} />
      {/*
        Both panels stay mounted. Unmounting the hidden one would discard its
        state, which is the whole point of keeping two clocks rather than one
        that changes direction.
      */}
      <div className="mt-3">
        <Panel mode="timer" current={mode}>
          <TimerFace />
        </Panel>
        <Panel mode="stopwatch" current={mode}>
          <StopwatchFace />
        </Panel>
      </div>
    </section>
  );
}

/**
 * The sliding two-up control.
 *
 * A tablist rather than a select: there are exactly two choices, both worth
 * naming on screen, and the thumb sliding between them is the affordance — a
 * dropdown would hide one option behind a tap and a menu.
 */
function ModeSwitch({ mode, onMode }: { mode: Mode; onMode: (next: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Clock mode"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onMode(mode === "timer" ? "stopwatch" : "timer");
      }}
      className="relative flex h-12 rounded-full bg-secondary p-1"
    >
      {/*
        The thumb is one element that moves, not two that fade: the travel is
        what tells you the two panels are the same control in two positions.
        Its width is exactly half the track's inner width, so a full translate
        lands it precisely on the second half.
      */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card",
          "shadow-[0_1px_2px_oklch(0.29_0.005_355/0.12)]",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          mode === "stopwatch" && "translate-x-full",
        )}
      />
      {(["timer", "stopwatch"] as const).map((candidate) => {
        const selected = mode === candidate;

        return (
          <button
            key={candidate}
            type="button"
            role="tab"
            id={`clock-tab-${candidate}`}
            aria-selected={selected}
            aria-controls={`clock-panel-${candidate}`}
            /** Only the selected tab is a tab stop; the arrow keys move between them. */
            tabIndex={selected ? 0 : -1}
            onClick={() => onMode(candidate)}
            className={cn(
              "font-display relative z-10 flex-1 rounded-full text-xs font-bold uppercase",
              "outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
            style={{ letterSpacing: "var(--tracking-label)" }}
          >
            {candidate === "timer" ? "Timer" : "Stopwatch"}
          </button>
        );
      })}
    </div>
  );
}

function Panel({
  mode,
  current,
  children,
}: {
  mode: Mode;
  current: Mode;
  children: React.ReactNode;
}) {
  const hidden = mode !== current;

  return (
    <div
      role="tabpanel"
      id={`clock-panel-${mode}`}
      aria-labelledby={`clock-tab-${mode}`}
      /** `hidden` and not a class: the panel is out of the tab order too, not just invisible. */
      hidden={hidden}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A running elapsed time in milliseconds.
 *
 * `startedAt` is when the current run began and `accumulated` is what previous
 * runs were worth; the sum is the truth, and `now` exists only to force a
 * re-render. Pausing folds the current run into `accumulated` and clears the
 * start, so the arithmetic works the same whether the clock has been paused
 * once or nine times.
 */
function useElapsed() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState(0);
  /**
   * The clock is read here rather than during render: `Date.now()` in a render
   * makes the component impure, and React may render without any time passing.
   */
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;

    /** Ten a second: fast enough that a seconds display never visibly skips. */
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt]);

  /**
   * Floored at zero: `now` is only refreshed by the interval and by starting,
   * so nothing guarantees it is not older than `startedAt` for a render.
   */
  const elapsed = accumulated + (startedAt === null ? 0 : Math.max(0, now - startedAt));

  const start = useCallback(() => {
    /** One reading for both, so the first frame reads exactly 0 rather than a stale gap. */
    const at = Date.now();
    setNow(at);
    setStartedAt((current) => current ?? at);
  }, []);

  const pause = useCallback(() => {
    setStartedAt((current) => {
      if (current !== null) setAccumulated((total) => total + (Date.now() - current));
      return null;
    });
  }, []);

  const reset = useCallback((to = 0) => {
    setStartedAt(null);
    setAccumulated(to);
  }, []);

  return { elapsed, running: startedAt !== null, start, pause, reset };
}

/**
 * The rest countdown.
 *
 * The duration is a separate piece of state from the elapsed time so that
 * +15s mid-rest extends the rest rather than restarting it, and so the face has
 * something to show before it is ever started.
 */
function TimerFace() {
  const [duration, setDuration] = useState(DEFAULT_DURATION * 1000);
  const { elapsed, running, start, pause, reset } = useElapsed();
  const alert = useAlert();

  const remaining = Math.max(0, duration - elapsed);
  const done = remaining === 0 && elapsed > 0;

  /**
   * Zero is reached inside a tick, not by an event, so the end is noticed here.
   * The clock is stopped as well as sounded — left running it would sit at
   * 0:00 with a live interval behind it, and Reset would then have to undo
   * elapsed time that no longer means anything.
   */
  useEffect(() => {
    if (!done || !running) return;
    pause();
    alert();
  }, [done, running, pause, alert]);

  function onPreset(seconds: number) {
    setDuration(seconds * 1000);
    reset();
  }

  return (
    <Face
      value={formatClock(remaining)}
      caption={done ? "Rest is up" : running ? "Resting" : "Ready"}
      emphasis={done}
      progress={duration === 0 ? 0 : 1 - remaining / duration}
      running={running}
      onToggle={() => {
        /** Pressing play on a finished countdown means another round, not nothing. */
        if (done) reset();
        if (running) pause();
        else start();
      }}
      onReset={() => reset()}
      /** Nothing has been spent yet, so there is nothing to reset. */
      resettable={elapsed > 0}
      toggleLabel={running ? "Pause the rest timer" : "Start the rest timer"}
    >
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {PRESETS.map((seconds) => (
          <Chip
            key={seconds}
            selected={duration === seconds * 1000 && elapsed === 0}
            onClick={() => onPreset(seconds)}
          >
            {seconds < 120 ? `${seconds}s` : `${seconds / 60}m`}
          </Chip>
        ))}
        <Chip
          onClick={() => setDuration((current) => Math.max(NUDGE * 1000, current - NUDGE * 1000))}
          aria-label={`Take ${NUDGE} seconds off`}
        >
          −{NUDGE}s
        </Chip>
        <Chip
          onClick={() => setDuration((current) => current + NUDGE * 1000)}
          aria-label={`Add ${NUDGE} seconds`}
        >
          +{NUDGE}s
        </Chip>
      </div>
    </Face>
  );
}

/** The stopwatch: no target, so no progress bar and no alert — it just counts. */
function StopwatchFace() {
  const { elapsed, running, start, pause, reset } = useElapsed();

  return (
    <Face
      value={formatClock(elapsed)}
      /** Tenths only here: a stopwatch is timing the work, where the tenth is the point. */
      fraction={formatTenths(elapsed)}
      caption={running ? "Running" : elapsed > 0 ? "Paused" : "Ready"}
      running={running}
      onToggle={() => (running ? pause() : start())}
      onReset={() => reset()}
      resettable={elapsed > 0}
      toggleLabel={running ? "Pause the stopwatch" : "Start the stopwatch"}
    />
  );
}

/* -------------------------------------------------------------------------- */

/** The shared body: one big number, a play/pause, a reset, and whatever else. */
function Face({
  value,
  fraction,
  caption,
  emphasis = false,
  progress,
  running,
  onToggle,
  onReset,
  resettable,
  toggleLabel,
  children,
}: {
  value: string;
  fraction?: string;
  caption: string;
  emphasis?: boolean;
  progress?: number;
  running: boolean;
  onToggle: () => void;
  onReset: () => void;
  resettable: boolean;
  toggleLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.25rem] bg-secondary p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="label-caps">{caption}</p>
          <p
            className={cn(
              "tabular font-display mt-1 text-[2.5rem] leading-none font-extrabold",
              emphasis && "text-brand",
            )}
            /** Read out when it settles, not ten times a second while it runs. */
            aria-live={running ? "off" : "polite"}
          >
            {value}
            {fraction ? (
              <span className="text-2xl font-bold text-muted-foreground">{fraction}</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ClockButton label={toggleLabel} onClick={onToggle} filled>
            {running ? (
              <Pause aria-hidden className="size-5" strokeWidth={2.5} />
            ) : (
              <Play aria-hidden className="size-5" strokeWidth={2.5} />
            )}
          </ClockButton>
          <ClockButton label="Reset" onClick={onReset} disabled={!resettable}>
            <RotateCcw aria-hidden className="size-5" strokeWidth={2.5} />
          </ClockButton>
        </div>
      </div>

      {progress === undefined ? null : (
        <div aria-hidden className="mt-4 h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-100 ease-linear motion-reduce:transition-none"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      )}

      {children}
    </div>
  );
}

function ClockButton({
  label,
  onClick,
  disabled = false,
  filled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  filled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-12 items-center justify-center rounded-full",
        "transition-[background-color,transform] active:scale-95",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-40",
        filled
          ? "bg-brand text-brand-foreground hover:bg-brand-deep"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  selected = false,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={props["aria-label"] ? undefined : selected}
      className={cn(
        "tabular h-9 rounded-full px-3 text-sm font-semibold transition-colors",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected
          ? "bg-brand text-brand-foreground"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The end-of-rest signal: a short tone and a buzz.
 *
 * Web Audio rather than an audio file, because this is two sine bursts and a
 * file would be an asset to ship, cache and fail to load. The context is
 * created on the first alert — one created before any gesture starts suspended
 * in every browser — and kept, since a page may rest many times.
 *
 * Everything here is best-effort: `AudioContext` can be missing or blocked and
 * `vibrate` exists on roughly one platform. A silent timer still shows 0:00.
 */
function useAlert() {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => void contextRef.current?.close(), []);

  return useCallback(() => {
    navigator.vibrate?.([120, 80, 120]);

    try {
      contextRef.current ??= new AudioContext();
      const context = contextRef.current;
      void context.resume();

      /** Two beeps, a tenth apart, so it reads as a signal and not as a glitch. */
      [0, 0.22].forEach((offset) => {
        const at = context.currentTime + offset;
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.frequency.value = 880;
        /** Ramped, not switched: a square-edged gain change clicks. */
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.2, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.18);
      });
    } catch {
      /** No audio available. The buzz and the face have already done the work. */
    }
  }, []);
}

/** `m:ss` under an hour, `h:mm:ss` over it. Rounded down, like every clock. */
function formatClock(milliseconds: number): string {
  const total = Math.floor(milliseconds / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  const rest = `${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

function formatTenths(milliseconds: number): string {
  return `.${Math.floor(milliseconds / 100) % 10}`;
}
