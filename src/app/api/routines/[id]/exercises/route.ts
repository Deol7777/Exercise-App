/**
 * /api/routines/[id]/exercises — what is in a routine.
 *
 * POST  appends an exercise. `position` is assigned by the database, never
 *       sent: the body names an exercise and nothing else.
 * PATCH rewrites the whole order. It takes every id, once — a partial list is
 *       a 422, because "move this one to the front" and "delete the rest"
 *       would otherwise be the same request.
 */
import { NextResponse } from "next/server";

import {
  addRoutineExerciseSchema,
  reorderRoutineExercisesSchema,
} from "@/lib/validation/routines";
import { currentUserId } from "@/server/auth";
import { addRoutineExercise, reorderRoutineExercises } from "@/server/services/routines";

import { isUuid } from "../../../_lib/params";
import { fromError, invalidBody, notFound, unauthenticated } from "../../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

const MISSING = "That routine does not exist.";

export async function POST(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound(MISSING);

  const parsed = addRoutineExerciseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await addRoutineExercise(userId, id, parsed.data), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound(MISSING);

  const parsed = reorderRoutineExercisesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await reorderRoutineExercises(userId, id, parsed.data.order));
  } catch (error) {
    return fromError(error);
  }
}
