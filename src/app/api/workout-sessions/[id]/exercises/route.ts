/**
 * POST /api/workout-sessions/[id]/exercises — add an exercise entry.
 *
 * One performance of a catalog exercise inside this session. `position` is not
 * accepted from the client: the entry goes on the end, and the database decides
 * what the end is.
 */
import { NextResponse } from "next/server";

import { addExerciseEntrySchema } from "@/lib/validation/training";
import { currentUserId } from "@/server/auth";
import { addExerciseEntry } from "@/server/services/training";

import { isUuid } from "../../../_lib/params";
import { fromError, invalidBody, notFound, unauthenticated } from "../../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That workout session does not exist.");

  const parsed = addExerciseEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    const entry = await addExerciseEntry(userId, id, parsed.data);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
