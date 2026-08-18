import type { DefaultSession } from "next-auth";

/**
 * `session.user.id` is the database id every query scopes by, so it must be
 * typed as always present rather than optional.
 */
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
