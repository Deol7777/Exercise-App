/**
 * POST /api/exercise-entries/[id]/sets — log a set.
 *
 * The leaf write, and the one that has to be fast: it is used between sets,
 * standing at a rack. Weight is kilograms; a display unit in pounds is
 * converted before it is sent.
 */
import { NextResponse } from "next/server";

import { addSetSchema } from "@/lib/validation/training";
import { currentUserId } from "@/server/auth";
import { logSet } from "@/server/services/training";

import { isUuid } from "@/app/api/_lib/params";
import { fromError, invalidBody, notFound, unauthenticated } from "@/app/api/_lib/respond";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();

  const { id } = await params;
  if (!isUuid(id)) return notFound("That exercise entry does not exist.");

  const parsed = addSetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    const set = await logSet(userId, id, parsed.data);
    return NextResponse.json(set, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
