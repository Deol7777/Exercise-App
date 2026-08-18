/**
 * GET /api/exercises/[id]/last-performance — what happened last time.
 *
 * `?exclude=<workout session id>` leaves a session out of the answer; the
 * logging screen passes the one in progress, so "last time" does not mean the
 * set logged a minute ago.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { currentUserId } from "@/server/auth";
import { getLastPerformance } from "@/server/services/progress";

import { isUuid } from "../../../_lib/params";
import { fromError, notFound, unauthenticated } from "../../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That exercise does not exist.");

  const exclude = request.nextUrl.searchParams.get("exclude") ?? undefined;

  try {
    const performance = await getLastPerformance(userId, id, {
      excludeWorkoutSessionId: exclude && isUuid(exclude) ? exclude : undefined,
    });
    return NextResponse.json(performance);
  } catch (error) {
    return fromError(error);
  }
}
