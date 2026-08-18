/**
 * DELETE /api/exercise-entries/[id] — remove one exercise entry and its sets.
 *
 * "Exercise entry" is the vocabulary word for a `session_exercises` row: one
 * performance of a catalog exercise inside a workout session (docs/glossary.md).
 */
import { NextResponse } from "next/server";

import { currentUserId } from "@/server/auth";
import { removeExerciseEntry } from "@/server/services/training";

import { isUuid } from "../../_lib/params";
import { fromError, notFound, unauthenticated } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That exercise entry does not exist.");

  try {
    await removeExerciseEntry(userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
