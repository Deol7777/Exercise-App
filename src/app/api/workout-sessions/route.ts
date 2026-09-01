/**
 * /api/workout-sessions — the training log's collection endpoint.
 *
 * GET  lists this user's sessions, newest first, with entry and set counts.
 *      `?active=true` returns the one still in progress with its exercise
 *      entries and sets, or null — the logging screen's whole payload.
 * POST starts a session: empty, pre-filled from one of this user's routines
 *      (`routineId`), or pre-filled from a shipped programme (`prebuiltId`).
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
  startWorkoutSessionFromPrebuiltRoutine,
  startWorkoutSessionFromRoutine,
} from "@/server/services/training";

import { fromError, invalidBody, unauthenticated } from "@/app/api/_lib/respond";

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

  const { routineId, prebuiltId, ...input } = parsed.data;

  try {
    /**
     * Three ways in, one endpoint, so all three pass the identical
     * one-open-session and no-future-start guards. `routineId` wins if a caller
     * sends both; the UI never does.
     */
    const session = routineId
      ? await startWorkoutSessionFromRoutine(userId, routineId, input)
      : prebuiltId
        ? await startWorkoutSessionFromPrebuiltRoutine(userId, prebuiltId, input)
        : await startWorkoutSession(userId, input);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
