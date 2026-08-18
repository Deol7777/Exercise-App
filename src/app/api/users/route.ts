/**
 * POST /api/users — register an account.
 *
 * The one route that is reachable without a session, because it is what creates
 * the thing sessions are made of. Four steps, in order: validate, delegate,
 * translate. (There is no session to resolve first.)
 */
import { NextResponse } from "next/server";

import { registerSchema } from "@/lib/validation/auth";
import { registerUser } from "@/server/services/users";

import { fromError, invalidBody } from "../_lib/respond";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  try {
    const user = await registerUser(parsed.data);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
