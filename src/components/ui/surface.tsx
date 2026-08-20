import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The card of the design language: warm white, a 28px radius, one hairline and
 * a shadow you should not be able to see so much as notice the absence of.
 *
 * This is deliberately not shadcn's `Card`. That one carries a header/content/
 * footer grammar these screens never use — the references put a stat grid or a
 * list straight onto the surface — and its `rounded-xl` is half the radius.
 */
export function Surface({
  className,
  inset = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & { inset?: "default" | "none" | "sm" }) {
  return (
    <div
      data-slot="surface"
      className={cn(
        "rounded-[var(--radius-surface)] border border-border bg-card text-card-foreground",
        "shadow-[0_1px_2px_oklch(0.29_0.005_355/0.05),0_8px_24px_-16px_oklch(0.29_0.005_355/0.14)]",
        inset === "default" && "p-6",
        inset === "sm" && "p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * The hairline that separates a card's title block from its statistics. It is
 * inset from the card's padding in the references, not bled to the edge.
 */
export function SurfaceRule({ className }: { className?: string }) {
  return <hr className={cn("my-5 border-t border-border", className)} />;
}

/**
 * A soft circular well — the exercise thumbnails in the library, the days that
 * have a workout on the history calendar. Holds a mascot or an initial.
 */
export function Well({
  className,
  size = "default",
  children,
}: {
  className?: string;
  size?: "default" | "sm";
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
        size === "default" ? "size-14" : "size-11",
        className,
      )}
    >
      {children}
    </div>
  );
}
