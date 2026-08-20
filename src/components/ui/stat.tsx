import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The statistic block the references repeat everywhere: a heavy display number,
 * an optional lowercase unit tucked against it at a fraction of the size, and
 * the uppercase label underneath.
 *
 * `unit` is separate from `value` on purpose — "62,410 lb" typed as one string
 * sets the "lb" at the same weight as the number and the whole thing turns to
 * mush. The unit is always the quiet part.
 */
export function Stat({
  value,
  unit,
  label,
  size = "default",
  className,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  size?: "default" | "lg" | "sm";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "tabular flex items-baseline gap-1 font-extrabold tracking-tight",
          size === "lg" && "text-[2.75rem] leading-none",
          size === "default" && "text-[2rem] leading-none",
          size === "sm" && "text-2xl leading-none",
        )}
      >
        <span className="font-display whitespace-nowrap">{value}</span>
        {unit ? (
          <span className="text-[0.4em] font-semibold text-muted-foreground">{unit}</span>
        ) : null}
      </p>
      <p className="label-caps mt-2 whitespace-nowrap">{label}</p>
    </div>
  );
}

/**
 * Statistics spread across the card, each column only as wide as it needs.
 *
 * Not equal thirds: "62,410 lb" sitting between "4" and "3" needs roughly half
 * the row, and an even split truncates it to "8,0…" while two thirds of the
 * card stands empty. Three across is the most that stays readable on a phone,
 * which is what the references use.
 */
export function StatRow({
  className,
  spread = true,
  children,
}: {
  className?: string;
  /**
   * Three statistics span the card; two read better clustered at the left, the
   * way the references show a session's volume beside its top set. Spread to
   * the edges, a pair looks like two unrelated cards sharing a border.
   */
  spread?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-flow-col auto-cols-max gap-4",
        spread ? "justify-between" : "justify-start gap-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A change against the past — "+50 lb" on the progress chart. Sage means the
 * number went the way the person wanted, which for weight and volume is up.
 */
export function Delta({ value, unit }: { value: number; unit?: string }) {
  const up = value >= 0;

  return (
    <span
      className={cn(
        "font-display tabular text-base font-extrabold",
        up ? "text-brand-deep" : "text-muted-foreground",
      )}
    >
      {up ? "+" : "−"}
      {Math.abs(value).toLocaleString()}
      {unit ? <span className="ml-0.5 text-[0.75em]">{unit}</span> : null}
    </span>
  );
}
