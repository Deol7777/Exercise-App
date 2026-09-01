/**
 * /api/routines/prebuilt — copying a shipped programme into your own routines.
 *
 * POST takes the prebuilt routine's slug and answers with the real, user-owned
 * routine it created, exactly as `POST /api/routines` does. A name already in
 * use is a 409 and an unknown slug a 404, both from the service.
 *
 * A static segment, so it wins over the sibling `[id]` — and routine ids are
 * uuids in any case.
 */
import { NextResponse } from "next/server";

import { copyPrebuiltRoutineSchema } from "@/lib/validation/routines";
import { currentUserId } from "@/server/auth";
import { copyPrebuiltRoutine } from "@/server/services/routines";

import { fromError, invalidBody, unauthenticated } from "@/app/api/_lib/respond";

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const parsed = copyPrebuiltRoutineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    return NextResponse.json(await copyPrebuiltRoutine(userId, parsed.data.prebuiltId), {
      status: 201,
    });
  } catch (error) {
    return fromError(error);
  }
}
