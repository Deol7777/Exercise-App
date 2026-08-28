/**
 * /api/workout-sessions — the training log's collection endpoint.
 *
 * GET  lists this user's sessions, newest first, with entry and set counts.
 *      `?active=true` returns the one still in progress with its exercise
 *      entries and sets, or null — the logging screen's whole payload.
 * POST starts a session, empty or pre-filled from a routine (`routineId`).
 *      Only one may be in progress at a time; a second attempt is a 409.
 *
 * The owning user is the session user, never anything in the request.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createWorkoutSessionSchema } from "@/lib/validation/training";
import { currentUserId } from "@/server/auth";
import {
  getActiveWorkoutSessionDetail,
  listWorkoutSessionsFor,
  startWorkoutSession,
  startWorkoutSessionFromRoutine,
} from "@/server/services/training";

import { fromError, invalidBody, unauthenticated } from "../_lib/respond";

const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const params = request.nextUrl.searchParams;

  try {
    if (params.get("active") === "true") {
      return NextResponse.json(await getActiveWorkoutSessionDetail(userId));
    }

    const limit = Math.min(Number(params.get("limit")) || 30, MAX_LIMIT);
    const offset = Math.max(Number(params.get("offset")) || 0, 0);

    return NextResponse.json(await listWorkoutSessionsFor(userId, { limit, offset }));
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const body = await request.json().catch(() => null);
  const parsed = createWorkoutSessionSchema.safeParse(body ?? {});
  if (!parsed.success) return invalidBody(parsed.error);

  const { routineId, ...input } = parsed.data;

  try {
    const session = routineId
      ? await startWorkoutSessionFromRoutine(userId, routineId, input)
      : await startWorkoutSession(userId, input);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
