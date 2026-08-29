/**
 * What a signed-in page needs before it can render: who is acting, and how the
 * app is drawn for them — display unit and palette.
 *
 * It exists because a session can outlive its account. Sessions are JWTs
 * (ADR 0007), so a token stays valid until it expires even after the account is
 * deleted — on another device, or if sign-out fails after deletion. Without
 * this, the first service call throws `not_found` and the page is a 500 rather
 * than a sign-in prompt.
 */
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Theme } from "@/lib/theme";
import type { WeightUnit } from "@/lib/weight";
import { auth } from "@/server/auth";
import { isDomainError } from "@/server/errors";

import { currentPreferences } from "./preferences";

/**
 * Memoized for the pass, so a page and anything it renders can each ask without
 * paying twice — and `email` comes off the JWT the session already decoded,
 * which is why Settings does not need a second `auth()` call of its own.
 */
export const requireAccount = cache(async function requireAccount(): Promise<{
  userId: string;
  email: string | null;
  unit: WeightUnit;
  theme: Theme;
}> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) redirect("/sign-in");

  try {
    /** Shared with the root layout's theme read — one query for the row, not two. */
    const { weightUnit, theme } = await currentPreferences(userId);
    return { userId, email: session?.user?.email ?? null, unit: weightUnit, theme };
  } catch (error) {
    /** The token refers to an account that no longer exists. */
    if (isDomainError(error) && error.code === "not_found") redirect("/sign-in");
    throw error;
  }
});
