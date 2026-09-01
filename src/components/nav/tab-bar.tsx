"use client";

import { CalendarDays, ChartLine, ClipboardList, Dumbbell, House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The five destinations, in the order the references show them. `match` is what
 * decides the active tab, because a nested route (`/history/[id]`) still belongs
 * to its tab; `/` would match everything under a prefix test, so it is exact.
 */
const TABS = [
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/workout", label: "Workout", icon: Dumbbell, exact: false },
  { href: "/routines", label: "Routines", icon: ClipboardList, exact: false },
  { href: "/history", label: "History", icon: CalendarDays, exact: false },
  { href: "/progress", label: "Progress", icon: ChartLine, exact: false },
] as const;

/**
 * Rendered by `Screen`, and only for screens that a signed-in user reached —
 * which is what keeps the bar honest. Deciding it from the auth session instead
 * gets this wrong in one specific case: a JWT outliving its account still
 * decodes (ADR 0007), so the home page would render its signed-out landing
 * wrapped in five tabs that all bounce back to /sign-in.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 backdrop-blur-md"
    >
      {/* The list holds the tab height; the padding below it is the home
          indicator, so the icons never sit under the gesture bar. */}
      <ul className="mx-auto flex max-w-md items-stretch pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[4.5rem] flex-col items-center justify-center gap-1.5 text-[0.6875rem] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon
                  aria-hidden
                  className="size-[1.375rem]"
                  /* Weight, not colour, is what reads as "you are here" on a
                     palette this low-contrast. */
                  strokeWidth={active ? 2.4 : 1.6}
                />
                <span className={cn("leading-none", active && "font-semibold")}>{label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "size-1 rounded-full bg-brand transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
