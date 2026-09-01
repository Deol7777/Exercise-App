import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A segmented control — the progress screen's range switch and line-or-bars
 * toggles, and the my-routines-or-prebuilt switch on /routines.
 *
 * Links, not buttons, so this stays a server component: the choice is already
 * in the URL and the server already re-renders for it, which leaves nothing for
 * JavaScript to do. It also means a middle-click opens the other view in a tab,
 * and the back button undoes a switch.
 *
 * `query` is the page's whole selection and each control writes only its own
 * parameter into it, so switching the range cannot reset which lift a card is
 * showing. A screen with one control passes `{}`.
 */
export function SegmentedLinks<T extends string>({
  options,
  value,
  param,
  query,
  basePath,
  label,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  /** The query parameter this control writes to. */
  param: string;
  query: Record<string, string>;
  /** The screen this control lives on, which every option links back to. */
  basePath: string;
  /** The accessible name; these have no visible label of their own. */
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("flex rounded-full border border-border bg-secondary/60 p-0.5", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Link
            key={option.value}
            href={`${basePath}?${new URLSearchParams({ ...query, [param]: option.value })}`}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-center text-xs font-semibold whitespace-nowrap transition-colors",
              selected
                ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.29_0.005_355/0.08)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
