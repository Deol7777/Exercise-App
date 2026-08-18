/**
 * /api/users/me — the signed-in user's own account.
 *
 * "me" is not a lookup: the id comes from the auth session, and there is no
 * route that takes a user id in the path. That is the whole point of the name.
 */
import { NextResponse } from "next/server";

import { updateAccountSchema } from "@/lib/validation/auth";
import { currentUserId } from "@/server/auth";
import { getWeightUnit, setWeightUnit } from "@/server/services/users";

import { fromError, invalidBody, unauthenticated } from "../../_lib/respond";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  try {
    return NextResponse.json({ weightUnit: await getWeightUnit(userId) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const parsed = updateAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json({ weightUnit: await setWeightUnit(userId, parsed.data.weightUnit) });
  } catch (error) {
    return fromError(error);
  }
}
