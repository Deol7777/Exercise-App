/**
 * The HTTP edge of the error contract. Domain services throw typed errors that
 * know nothing about HTTP; this is the only place that turns one into a status
 * code, and every route handler uses it rather than inventing its own mapping.
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import { isDomainError, type DomainErrorCode } from "@/server/errors";

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 422,
};

export function unauthenticated() {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}

/**
 * A path segment that is not a UUID. Reported as 404 rather than 422: a
 * malformed id and an id belonging to somebody else must look the same, or the
 * difference becomes a way to probe for rows.
 */
export function notFound(message = "Not found.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** A body that failed its Zod schema. Field errors are returned so a form can show them. */
export function invalidBody(error: ZodError) {
  return NextResponse.json(
    { error: "Invalid request body.", fields: error.flatten().fieldErrors },
    { status: 422 },
  );
}

/**
 * Anything a service threw. A domain error maps to its status; anything else is
 * a bug, so it is logged and reported as a 500 with no internal detail.
 */
export function fromError(error: unknown) {
  if (isDomainError(error)) {
    return NextResponse.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
  }

  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
