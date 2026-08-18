/**
 * Typed domain errors.
 *
 * Domain services know nothing about HTTP — no Request, no Response, no status
 * codes. They throw one of these, and the route handler at the edge is the only
 * place that decides what an error means to a client.
 */

export type DomainErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "Sign in to continue.") {
    super("unauthenticated", message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "That is not yours.") {
    super("forbidden", message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Not found.") {
    super("not_found", message);
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Already exists.") {
    super("conflict", message);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
