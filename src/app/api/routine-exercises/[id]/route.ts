/**
 * /api/routine-exercises/[id] — one exercise inside a routine.
 *
 * DELETE removes it. The gap it leaves in `position` is closed by the next
 *        reorder, not here; order is read as a sequence, never as arithmetic on
 *        the numbers.
 *
 * Ownership is resolved by joining back to the routine, so somebody else's id
 * is a 404.
 */
import { NextResponse } from "next/server";

import { currentUserId } from "@/server/auth";
import { removeRoutineExercise } from "@/server/services/routines";

import { isUuid } from "../../_lib/params";
import { fromError, notFound, unauthenticated } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That routine exercise does not exist.");

  try {
    await removeRoutineExercise(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
