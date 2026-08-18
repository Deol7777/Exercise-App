/**
 * GET /api/progress/personal-records — the heaviest working set per exercise.
 *
 * Per user, never global (docs/glossary.md). Warm-up sets do not count.
 */
import { NextResponse } from "next/server";

import { currentUserId } from "@/server/auth";
import { getPersonalRecords } from "@/server/services/progress";

import { fromError, unauthenticated } from "../../_lib/respond";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  try {
    return NextResponse.json(await getPersonalRecords(userId));
  } catch (error) {
    return fromError(error);
  }
}
