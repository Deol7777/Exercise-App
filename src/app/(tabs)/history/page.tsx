import Link from "next/link";

import { requireAccount } from "@/app/_lib/require-account";
import { MonthCalendar } from "@/features/history/components/month-calendar";
import { Screen, ScreenHeader, SectionHeader } from "@/components/layout/screen";
import { Mascot } from "@/components/ui/mascot";
import { Stat, StatRow } from "@/components/ui/stat";
import { Surface, SurfaceRule } from "@/components/ui/surface";
import { dayLabel, formatDuration, plural, sessionMinutes } from "@/lib/format";
import { monthLabel, parseMonth } from "@/lib/month";
import { getMonthOfHistory } from "@/server/services/progress";
import { listWorkoutSessionsFor } from "@/server/services/training";

/** How many sessions the list under the calendar shows. */
const RECENT = 5;

/**
 * The log read back: which days of a month were trained, what the month adds up
 * to, and the last few sessions as a way in.
 *
 * The month lives in the URL rather than in component state, which is what keeps
 * this a server component — one round trip per month, no client-side fetching,
 * and the browser's back button walks back through the months.
 *
 * The recent list is deliberately *not* scoped to the displayed month: scrolling
 * back to an empty February should not empty the list of somewhere to go.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { userId } = await requireAccount();
  const { month: requested } = await searchParams;

  /** One `now` for the whole render, so the calendar and the labels agree. */
  const now = new Date();
  const month = parseMonth(requested, now);

  const [monthOfHistory, sessions] = await Promise.all([
    getMonthOfHistory(userId, month),
    listWorkoutSessionsFor(userId, { limit: RECENT }),
  ]);

  return (
    <Screen>
      <ScreenHeader eyebrow="History" title={monthLabel(month, now)} />

      <Surface>
        <MonthCalendar month={month} days={monthOfHistory.days} now={now} />
        <SurfaceRule />
        <StatRow spread={false}>
          <Stat value={monthOfHistory.workouts} label="Sessions" />
          <Stat
            value={monthOfHistory.minutes === 0 ? "—" : formatDuration(monthOfHistory.minutes)}
            label="In the gym"
          />
        </StatRow>
      </Surface>

      <section className="mt-10">
        <SectionHeader label="Recent sessions" />
        {sessions.length === 0 ? (
          <Surface className="text-sm text-muted-foreground">
            Nothing logged yet.{" "}
            <Link href="/workout" className="text-foreground underline underline-offset-4">
              Start a workout
            </Link>{" "}
            and it will show up here.
          </Surface>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link href={`/history/${session.id}`} className="block">
                  <Surface
                    inset="sm"
                    className="relative flex items-center gap-4 transition-colors hover:bg-secondary/40"
                  >
                    <Mascot
                      seed={session.id}
                      size="sm"
                      className="pointer-events-none size-11 shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display truncate text-lg font-extrabold">
                        {dayLabel(session.startedAt, now)}
                      </h3>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {session.endedAt ? (
                          <>
                            {formatDuration(sessionMinutes(session))} ·{" "}
                            {plural(session.exerciseCount, "exercise")} ·{" "}
                            {plural(session.setCount, "set")}
                          </>
                        ) : (
                          <span className="text-brand-deep">In progress</span>
                        )}
                      </p>
                    </div>
                  </Surface>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        {footnote(monthOfHistory.workouts)}
      </p>
    </Screen>
  );
}

function footnote(workouts: number): string {
  if (workouts === 0) return "An empty month. The sloth approves.";
  if (workouts >= 16) return "The gorilla has stopped keeping count.";
  return "The duck has been reviewing your attendance.";
}
