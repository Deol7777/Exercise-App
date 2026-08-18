/**
 * /api/workout-sessions/[id] — one workout session.
 *
 * GET    returns it with its exercise entries and their sets.
 * PATCH  edits notes and/or the end time. `endedAt: null` reopens it.
 * DELETE removes it, cascading to entries and sets.
 *
 * The id in the path selects a row; it never establishes who is asking. Every
 * call is scoped to the session user, so somebody else's id is a 404.
 */
import { NextResponse } from "next/server";

import { updateWorkoutSessionSchema } from "@/lib/validation/training";
import { currentUserId } from "@/server/auth";
import {
  editWorkoutSession,
  getWorkoutSession,
  removeWorkoutSession,
} from "@/server/services/training";

import { isUuid } from "../../_lib/params";
import { fromError, invalidBody, notFound, unauthenticated } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That workout session does not exist.");

  try {
    return NextResponse.json(await getWorkoutSession(userId, id));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That workout session does not exist.");

  const parsed = updateWorkoutSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await editWorkoutSession(userId, id, parsed.data));
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That workout session does not exist.");

  try {
    await removeWorkoutSession(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
