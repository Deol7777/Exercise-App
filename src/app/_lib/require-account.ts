/**
 * What a signed-in page needs before it can render: who is acting, and their
 * display unit.
 *
 * It exists because a session can outlive its account. Sessions are JWTs
 * (ADR 0007), so a token stays valid until it expires even after the account is
 * deleted — on another device, or if sign-out fails after deletion. Without
 * this, the first service call throws `not_found` and the page is a 500 rather
 * than a sign-in prompt.
 */
import { redirect } from "next/navigation";

import type { WeightUnit } from "@/lib/weight";
import { currentUserId } from "@/server/auth";
import { isDomainError } from "@/server/errors";
import { getWeightUnit } from "@/server/services/users";

export async function requireAccount(): Promise<{ userId: string; unit: WeightUnit }> {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  try {
    return { userId, unit: await getWeightUnit(userId) };
  } catch (error) {
    /** The token refers to an account that no longer exists. */
    if (isDomainError(error) && error.code === "not_found") redirect("/sign-in");
    throw error;
  }
}
