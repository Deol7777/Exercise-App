/**
 * GET /api/progress/volume — working-set volume by muscle group, by week.
 *
 * `?weeks=` defaults to 8 and is clamped in the service, not here: how far back
 * it is sensible to look is a domain question, not an HTTP one.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { currentUserId } from "@/server/auth";
import { DEFAULT_WEEKS, getWeeklyVolume } from "@/server/services/progress";

import { fromError, unauthenticated } from "@/app/api/_lib/respond";

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const weeks = Number(request.nextUrl.searchParams.get("weeks")) || DEFAULT_WEEKS;

  try {
    return NextResponse.json(await getWeeklyVolume(userId, weeks));
  } catch (error) {
    return fromError(error);
  }
}
