/**
 * DELETE /api/sets/[id] — remove one set.
 *
 * Deleting leaves a gap in `position` rather than renumbering the rows after
 * it. Order is what `position` is for; the values being contiguous is not
 * something anything relies on.
 */
import { NextResponse } from "next/server";

import { currentUserId } from "@/server/auth";
import { removeSet } from "@/server/services/training";

import { isUuid } from "../../_lib/params";
import { fromError, notFound, unauthenticated } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

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
