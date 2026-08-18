/**
 * /api/exercises — the movement catalog.
 *
 * GET  lists what this user may see: every global exercise plus their own.
 * POST creates a custom exercise, private to them.
 *
 * Four steps, in order: authenticate, validate, delegate, translate.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createExerciseSchema } from "@/lib/validation/training";
import { currentUserId } from "@/server/auth";
import { createCustomExercise, listExercises } from "@/server/services/exercises";

import { fromError, invalidBody, unauthenticated } from "../_lib/respond";

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  try {
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    return NextResponse.json(await listExercises(userId, { search }));
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const parsed = createExerciseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    const exercise = await createCustomExercise(userId, parsed.data);
    return NextResponse.json(exercise, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
