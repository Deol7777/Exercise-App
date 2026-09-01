import { ArrowUpRight, Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Greeting } from "@/features/home/components/greeting";
import { StartWorkoutButton } from "@/features/training/components/start-workout-button";
import { Screen, ScreenHeader, SectionHeader } from "@/components/layout/screen";
/**
 * Home is the one tab outside the `(tabs)` group — it also renders a signed-out
 * landing, and a layout cannot tell which of the two it got — so it renders the
 * bar itself. The cost is that Home↔tab remounts it; tab↔tab does not.
 */
import { TabBar } from "@/components/nav/tab-bar";
import { Mascot } from "@/components/ui/mascot";
import { PillButton } from "@/components/ui/pill-button";
import { Stat, StatRow } from "@/components/ui/stat";
import { Surface, SurfaceRule } from "@/components/ui/surface";
import { dayLabel, formatDuration, plural, sessionMinutes } from "@/lib/format";
import { fromKilograms, type WeightUnit } from "@/lib/weight";
import { auth } from "@/server/auth";
import { isDomainError } from "@/server/errors";
import { getTrainingSummary } from "@/server/services/progress";
import { listRoutinesFor } from "@/server/services/routines";
import { getActiveWorkoutSessionDetail } from "@/server/services/training";

import { currentPreferences } from "./_lib/preferences";

/** A server component may call a domain service directly; it must not query the database inline. */
export default async function HomePage() {
  const session = await auth();
  /**
   * A JWT can outlive its account (ADR 0007), so a missing user is a signed-out
   * landing page here, not an error.
   */
  const unit = session?.user?.id ? await weightUnitOrNull(session.user.id) : null;
  if (!session?.user?.id || !unit) return <SignedOutLanding />;

  const userId = session.user.id;
  const [active, summary, routines] = await Promise.all([
    getActiveWorkoutSessionDetail(userId),
    getTrainingSummary(userId),
    listRoutinesFor(userId),
  ]);

  /**
   * Working sets only, matching what `findLatestFinishedSession` counts — if
   * this counted warm-ups too, finishing a workout would silently drop the
   * number between the card above and the card below.
   */
  const activeSetCount =
    active?.exercises.reduce((total, entry) => total + entry.sets.filter((s) => !s.isWarmup).length, 0) ?? 0;

  return (
    <>
      <Screen>
        <div className="relative">
          <ScreenHeader
            eyebrow={<Greeting />}
            title={headline(Boolean(active), Boolean(summary.today?.endedAt))}
            action={
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
              >
                <Settings aria-hidden className="size-4" />
              </Link>
            }
          />
          {/* The animal sits *over* the seam between headline and card, the way
              the references have it. Pointer events off so it never eats a tap. */}
          <Mascot
            seed={userId}
            size="lg"
            className="pointer-events-none absolute -bottom-8 right-2 h-24 w-24"
          />
        </div>

        <Surface className="relative">
          {active ? (
            <>
              <p className="label-caps">In progress</p>
              <h2 className="mt-1 text-3xl font-extrabold">Keep going</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {describeEntries(active.exercises.map((entry) => entry.exercise.name))}
              </p>
              <SurfaceRule />
              <StatRow>
                <Stat value={active.exercises.length} label="Exercises" />
                <Stat value={activeSetCount} label="Sets" />
                <Stat
                  value={sessionMinutes(active)}
                  unit="min"
                  label="Elapsed"
                />
              </StatRow>
            </>
          ) : summary.today ? (
            <>
              {/* Trained today and already finished. The card is filled by having
                  done the work, not by having a plan for it. */}
              <p className="label-caps">Today</p>
              <h2 className="mt-1 text-3xl font-extrabold">Done</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {plural(summary.today.exerciseCount, "exercise")} ·{" "}
                {plural(summary.today.setCount, "set")}
              </p>
              <SurfaceRule />
              <StatRow>
                <Stat value={formatDuration(sessionMinutes(summary.today))} label="Time" />
                <Stat
                  value={Math.round(fromKilograms(summary.today.volume, unit)).toLocaleString()}
                  unit={unit}
                  label="Volume"
                />
                <Stat
                  value={topSetValue(summary.today.topSet, unit)}
                  unit={summary.today.topSet ? unit : undefined}
                  label="Top set"
                />
              </StatRow>
            </>
          ) : (
            <>
              <p className="label-caps">Today</p>
              <h2 className="mt-1 text-3xl font-extrabold">Nothing started yet</h2>
              <p className="mt-2 max-w-[22ch] text-sm text-muted-foreground">
                {summary.lastSession
                  ? `Last one was ${dayLabel(summary.lastSession.startedAt).toLowerCase()}.`
                  : "Your first workout starts here."}
              </p>
            </>
          )}
        </Surface>

        <div className="mt-6">
          <StartWorkoutButton
            hasActiveSession={Boolean(active)}
            trainedToday={Boolean(summary.today?.endedAt)}
            routineCount={routines.length}
          />
        </div>

        <section className="mt-10">
          <SectionHeader label="This week" action={<QuietLink href="/progress">Progress</QuietLink>} />
          <Surface>
            <StatRow>
              <Stat value={summary.week.workouts} label="Workouts" />
              <Stat
                value={Math.round(fromKilograms(summary.week.volume, unit)).toLocaleString()}
                unit={unit}
                label="Volume"
              />
              <Stat value={summary.week.personalRecords} label="PRs" />
            </StatRow>
          </Surface>
        </section>

        <section className="mt-10">
          <SectionHeader label="Recent" action={<QuietLink href="/history">History</QuietLink>} />
          {summary.lastSession ? (
            <Link href={`/history/${summary.lastSession.id}`} className="block">
              <Surface className="relative transition-colors hover:bg-secondary/40">
                <h3 className="text-2xl font-extrabold">
                  {dayLabel(summary.lastSession.startedAt)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDuration(sessionMinutes(summary.lastSession))} ·{" "}
                  {plural(summary.lastSession.exerciseCount, "exercise")} ·{" "}
                  {plural(summary.lastSession.setCount, "set")}
                </p>
                <Mascot
                  seed={summary.lastSession.id}
                  size="md"
                  className="pointer-events-none absolute right-5 top-5 h-14 w-14"
                />
                <SurfaceRule />
                <StatRow spread={false}>
                  <Stat
                    value={Math.round(fromKilograms(summary.lastSession.volume, unit)).toLocaleString()}
                    unit={unit}
                    label="Volume"
                    size="sm"
                  />
                  <Stat
                    value={topSetValue(summary.lastSession.topSet, unit)}
                    unit={summary.lastSession.topSet ? unit : undefined}
                    label="Top set"
                    size="sm"
                  />
                </StatRow>
              </Surface>
            </Link>
          ) : (
            <Surface className="text-sm text-muted-foreground">
              Nothing finished yet. The first workout you complete shows up here.
            </Surface>
          )}
        </section>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          {summary.week.workouts >= 4
            ? "The frog is starting to worry about you."
            : "The frog has been here since 5 a.m."}
        </p>
      </Screen>
      <TabBar />
    </>
  );
}

/** The headline answers the state of the day, not the time of it. */
function headline(active: boolean, doneToday: boolean): string {
  if (active) return "You left one running.";
  if (doneToday) return "That is enough for one day.";
  return "Ready to make questionable decisions?";
}

/** "Bench, incline, dips" — the first few, then a count for the rest. */
function describeEntries(names: string[]): string {
  if (names.length === 0) return "No exercises added yet.";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

function topSetValue(topSet: { weight: number } | null, unit: WeightUnit): string {
  if (!topSet) return "—";
  return fromKilograms(topSet.weight, unit).toLocaleString();
}

/** The "Progress ↗" / "History ↗" affordance beside a section label. */
function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </Link>
  );
}

function SignedOutLanding() {
  return (
    <Screen chrome={false} className="flex flex-col justify-center">
      <ScreenHeader eyebrow="Workout logger" title="Write it down. Watch it move." />
      <Surface className="flex flex-col items-center gap-4 text-center">
        <Mascot name="gorilla" size="lg" />
        <p className="text-sm text-muted-foreground text-balance">
          Record a session set by set, then read it back as progress.
        </p>
      </Surface>
      <div className="mt-6 flex flex-col gap-3">
        <PillButton asChild>
          <Link href="/sign-in">Sign in</Link>
        </PillButton>
        <PillButton asChild variant="outline">
          <Link href="/sign-up">Create account</Link>
        </PillButton>
      </div>
    </Screen>
  );
}

/**
 * Through `currentPreferences` rather than `getWeightUnit`: the root layout has
 * already read this exact row to pick the palette, so inside one render pass
 * this costs nothing. Reading it the direct way made Home's first await a
 * second query for a row it already had.
 */
async function weightUnitOrNull(userId: string) {
  try {
    return (await currentPreferences(userId)).weightUnit;
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") return null;
    throw error;
  }
}
