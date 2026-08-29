import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Every screen behind the tab bar. Mobile first: a single column capped at the
 * width of a large phone, centred once the viewport is wider than that, with
 * the tab bar's height reserved at the bottom so the last card clears it.
 *
 * It does not render the tab bar. The bar belongs to `(tabs)/layout.tsx`, which
 * is a layout precisely so it survives a navigation between tabs instead of
 * unmounting with the page — rendering it from here put it inside every page's
 * own payload, so it could not paint until that page's data had resolved.
 */
export function Screen({
  className,
  chrome = true,
  children,
}: {
  className?: string;
  /**
   * False for a screen a signed-out visitor can see: no tab bar is rendered
   * above it, so there is no bar height to reserve at the bottom.
   */
  chrome?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-md flex-1 px-6 pt-14",
        chrome && "pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+1.5rem)]",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * The eyebrow-over-headline pair that opens every screen in the references:
 * GOOD MORNING / Ready to make…, LIBRARY / Exercises, HISTORY / August.
 *
 * The eyebrow is the quiet half. If it is competing with the headline for
 * attention, the tracking or the colour is wrong, not the size.
 */
export function ScreenHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      {/* The action rides on the eyebrow line rather than beside the headline:
          sharing a row with the title costs it the width it needs, and this
          headline is long on purpose. */}
      <div className="flex items-center justify-between gap-4">
        <p className="label-caps">{eyebrow}</p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <h1 className="mt-2 text-[2.5rem] leading-[1.05] font-extrabold text-balance">{title}</h1>
    </header>
  );
}

/**
 * A labelled band between cards — THIS WEEK, RECENT, RECENT SESSIONS — with an
 * optional link out to the screen that shows all of it.
 */
export function SectionHeader({
  label,
  action,
  className,
}: {
  label: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-4", className)}>
      <h2 className="label-caps">{label}</h2>
      {action}
    </div>
  );
}
