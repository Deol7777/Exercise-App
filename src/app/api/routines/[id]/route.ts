/**
 * /api/routines/[id] — one routine.
 *
 * GET    returns it with its exercises, in order.
 * PATCH  renames it and/or edits its notes.
 * DELETE removes it, cascading to the exercises in it. Workout sessions started
 *        from it are untouched — nothing links them.
 *
 * The id in the path selects a row; it never establishes who is asking. Every
 * call is scoped to the session user, so somebody else's id is a 404.
 */
import { NextResponse } from "next/server";

import { updateRoutineSchema } from "@/lib/validation/routines";
import { currentUserId } from "@/server/auth";
import { editRoutine, getRoutine, removeRoutine } from "@/server/services/routines";

import { isUuid } from "../../_lib/params";
import { fromError, invalidBody, notFound, unauthenticated } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

const MISSING = "That routine does not exist.";

export async function GET(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound(MISSING);

  try {
    return NextResponse.json(await getRoutine(userId, id));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound(MISSING);

  const parsed = updateRoutineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await editRoutine(userId, id, parsed.data));
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound(MISSING);

  try {
    await removeRoutine(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
