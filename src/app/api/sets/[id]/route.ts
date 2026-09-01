/**
 * /api/sets/[id] — correct or remove one logged set.
 *
 * Deleting leaves a gap in `position` rather than renumbering the rows after
 * it. Order is what `position` is for; the values being contiguous is not
 * something anything relies on.
 */
import { NextResponse } from "next/server";

import { updateSetSchema } from "@/lib/validation/training";
import { currentUserId } from "@/server/auth";
import { editSet, removeSet } from "@/server/services/training";

import { isUuid } from "@/app/api/_lib/params";
import { fromError, invalidBody, notFound, unauthenticated } from "@/app/api/_lib/respond";

type Context = { params: Promise<{ id: string }> };

/** PATCH corrects reps, weight or the warm-up flag. Position is not editable. */
export async function PATCH(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That set does not exist.");

  const parsed = updateSetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await editSet(userId, id, parsed.data));
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That set does not exist.");

  try {
    await removeSet(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
