/**
 * Auth.js mounts its own endpoints here (sign-in, callback, session, CSRF).
 * This is the one route in the app that is not hand-written.
 */
import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;
