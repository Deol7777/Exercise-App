/**
 * /api/users/me — the signed-in user's own account.
 *
 * "me" is not a lookup: the id comes from the auth session, and there is no
 * route that takes a user id in the path. That is the whole point of the name.
 */
import { NextResponse } from "next/server";

import { updateAccountSchema } from "@/lib/validation/auth";
import { currentUserId } from "@/server/auth";
import { deleteAccount, getPreferences, updatePreferences } from "@/server/services/users";

import { fromError, invalidBody, unauthenticated } from "../../_lib/respond";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  try {
    return NextResponse.json(await getPreferences(userId));
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
    /** Answers with the whole set, so a body that named one setting still leaves the client consistent. */
    return NextResponse.json(await updatePreferences(userId, parsed.data));
  } catch (error) {
    return fromError(error);
  }
}

/**
 * Deletes the account and everything in it. Irreversible, and scoped to the
 * session — there is no way to spell somebody else's account here.
 *
 * The auth session outlives this by design: the JWT stays valid until it
 * expires (ADR 0007), so the client signs out immediately afterwards. A request
 * made with that token in between finds no user and gets a 404.
 */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  try {
    await deleteAccount(userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
