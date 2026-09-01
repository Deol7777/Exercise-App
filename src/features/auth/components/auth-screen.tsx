import Link from "next/link";
import type { ReactNode } from "react";

import { Screen } from "@/components/layout/screen";
import { Mascot } from "@/components/ui/mascot";
import { SegmentedNav } from "@/components/ui/segmented-links";

/**
 * The shell both doors share: back-and-wordmark bar, the animals, the headline
 * pair, the sign-in-or-sign-up switch, and the fine print. Only the form
 * between the switch and the fine print differs, so it is the one thing passed
 * in — the two screens cannot drift apart by being edited separately.
 *
 * No tab bar: a signed-out visitor has no tabs, so `chrome={false}` also drops
 * the bar-height padding that would otherwise strand the fine print above a
 * gap.
 */
export function AuthScreen({
  mode,
  title,
  subtitle,
  children,
}: {
  mode: "sign-in" | "sign-up";
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Screen chrome={false} className="pt-6 pb-10">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="label-caps transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
        <span className="label-caps">Exercise</span>
      </div>

      <AnimalRow />

      <h1 className="mt-6 text-center text-[2.5rem] leading-[1.05] font-extrabold text-balance">
        {title}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">{subtitle}</p>

      <SegmentedNav
        label="Sign in or create an account"
        /* Uppercase like the micro-labels below it — the references set this
           switch in the same voice as EMAIL and the button. */
        className="mt-8 uppercase [letter-spacing:var(--tracking-label)]"
        items={[
          { href: "/sign-in", label: "Sign in", selected: mode === "sign-in" },
          { href: "/sign-up", label: "New beast", selected: mode === "sign-up" },
        ]}
      />

      <div className="mt-7">{children}</div>

      <p className="mt-8 text-center text-xs text-muted-foreground text-balance">
        By continuing you agree to lift things and be silently judged by a frog.
      </p>
    </Screen>
  );
}

/**
 * The frog centred and raised, flanked by two smaller animals sitting lower —
 * the arrangement in the references. Pinned by name rather than seeded: this is
 * the one screen with no user to hash, and the frog is the app's face.
 */
function AnimalRow() {
  return (
    <div aria-hidden className="mt-6 flex items-end justify-center gap-2">
      <Mascot name="gorilla" size="md" className="h-12 w-12 translate-y-1" />
      <Mascot name="frog" size="lg" className="h-28 w-28" />
      <Mascot name="capybara" size="md" className="h-12 w-12 translate-y-1" />
    </div>
  );
}
