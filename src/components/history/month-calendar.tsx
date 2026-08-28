import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  currentMonth,
  isFutureOrCurrent,
  isSameMonth,
  type Month,
  monthGrid,
  monthKey,
  monthLabel,
  nextMonth,
  previousMonth,
  weekdayInitials,
} from "@/lib/month";
import { zonedDate } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import type { MonthDay } from "@/server/services/progress";

/**
 * The month at a glance: a day with a workout on it is filled brand, and it is
 * the link into that workout. Everything else is a plain number.
 *
 * A server component with no state of its own — the month lives in the URL
 * (`?month=2026-08`), so the arrows are links and the back button works. Filling
 * the day is the whole point of the screen, so it is `bg-brand` rather than a
 * dot: a 40px circle of colour reads across the whole grid at a glance, and a
 * 4px dot does not.
 */
export function MonthCalendar({
  month,
  days,
  now = new Date(),
}: {
  month: Month;
  days: MonthDay[];
  /** Injected so "today" is decided once per render, not per cell. */
  now?: Date;
}) {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const cells = monthGrid(month);
  const showingThisMonth = isSameMonth(month, currentMonth(now));
  const today = showingThisMonth ? zonedDate(now).day : null;

  return (
    <section aria-label={`Workouts in ${monthLabel(month, now)}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <MonthArrow month={previousMonth(month)} direction="previous" />
        <p className="font-display text-lg font-extrabold">{monthLabel(month, now)}</p>
        {/* Forward past the current month is always empty, so the arrow is
            disabled rather than leading somewhere with nothing in it. */}
        <MonthArrow
          month={nextMonth(month)}
          direction="next"
          disabled={isFutureOrCurrent(month, now)}
        />
      </div>

      <div aria-hidden className="mb-2 grid grid-cols-7 gap-1">
        {weekdayInitials().map((initial, index) => (
          <span
            key={index}
            className="label-caps text-center text-[0.625rem] text-muted-foreground"
          >
            {initial}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) =>
          day === null ? (
            <span key={`blank-${index}`} aria-hidden />
          ) : (
            <DayCell
              key={day}
              day={day}
              month={month}
              worked={byDay.get(day)}
              isToday={day === today}
              /* A day that has not happened yet is quieter still — an empty
                 cell for the 3rd and for the 30th should not look alike on
                 the 4th. */
              future={today !== null && day > today}
            />
          ),
        )}
      </div>
    </section>
  );
}

/**
 * One square of the grid. A worked day is a link; an empty one is text, because
 * there is nothing behind it to navigate to.
 *
 * Two or more sessions on the same day link to the first of them and say so in
 * the accessible name — the calendar has one cell per day and the list below is
 * where a second session of the day is visible as its own row.
 */
function DayCell({
  day,
  month,
  worked,
  isToday,
  future,
}: {
  day: number;
  month: Month;
  worked: MonthDay | undefined;
  isToday: boolean;
  future: boolean;
}) {
  const shape = cn(
    "tabular flex aspect-square w-full items-center justify-center rounded-full text-sm font-semibold transition-colors",
  );

  if (!worked) {
    return (
      <span
        className={cn(
          shape,
          future ? "text-muted-foreground/40" : "text-muted-foreground",
          isToday && "ring-1 ring-border ring-inset",
        )}
      >
        {day}
      </span>
    );
  }

  const date = new Date(Date.UTC(month.year, month.month - 1, day)).toLocaleDateString(undefined, {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return (
    <Link
      href={`/history/${worked.workoutSessionId}`}
      aria-label={
        worked.sessionCount > 1
          ? `${date}: ${worked.sessionCount} workouts`
          : `${date}: workout`
      }
      className={cn(
        shape,
        "bg-brand text-brand-foreground hover:bg-brand-deep",
        isToday && "ring-2 ring-brand/30 ring-offset-2 ring-offset-card",
      )}
    >
      {day}
    </Link>
  );
}

function MonthArrow({
  month,
  direction,
  disabled = false,
}: {
  month: Month;
  direction: "previous" | "next";
  disabled?: boolean;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const shape =
    "flex size-9 items-center justify-center rounded-full border border-border transition-colors";

  if (disabled) {
    return (
      <span aria-hidden className={cn(shape, "text-muted-foreground/30")}>
        <Icon className="size-4" />
      </span>
    );
  }

  return (
    <Link
      href={`/history?month=${monthKey(month)}`}
      aria-label={`${direction === "previous" ? "Previous" : "Next"} month`}
      className={cn(shape, "text-muted-foreground hover:bg-secondary hover:text-foreground")}
    >
      <Icon aria-hidden className="size-4" />
    </Link>
  );
}
