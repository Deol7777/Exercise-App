/**
 * /api/routines — the routine collection.
 *
 * GET  lists this user's routines alphabetically, with a count of what is in
 *      each one.
 * POST creates one. Names are unique per user; a repeat is a 409.
 *
 * The owning user is the session user, never anything in the request.
 */
import { NextResponse } from "next/server";

import { createRoutineSchema } from "@/lib/validation/routines";
import { currentUserId } from "@/server/auth";
import { createRoutine, listRoutinesFor } from "@/server/services/routines";

import { fromError, invalidBody, unauthenticated } from "../_lib/respond";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  try {
    return NextResponse.json(await listRoutinesFor(userId));
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const parsed = createRoutineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await createRoutine(userId, parsed.data), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
