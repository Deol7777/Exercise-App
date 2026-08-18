/**
 * Dynamic segments arrive as strings from the URL and are never trusted. Every
 * id in this API is a UUID, and a value that is not one is rejected before it
 * reaches a query — Postgres would otherwise fail on the cast and surface a 500
 * for what is really a bad request.
 */
import { z } from "zod";

const uuid = z.uuid();

export function isUuid(value: string): boolean {
  return uuid.safeParse(value).success;
}
