/**
 * Auth.js v5 (ADR 0005). Users live in our own Postgres, so every training row
 * carries a real foreign key to `users.id`.
 *
 * Session strategy is `jwt`, not the adapter's database sessions: the
 * Credentials provider cannot issue database sessions. The adapter is still
 * wired up so that adding an OAuth provider later is configuration rather than
 * a migration — see docs/decisions/0007.
 */
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { signInSchema } from "@/lib/validation/auth";

import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { verifyCredentials } from "./services/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * Returning null is the only failure signal Auth.js accepts here, and it
       * is deliberately the same for a malformed field, an unknown email and a
       * wrong password.
       */
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await verifyCredentials(parsed.data);
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    /** Carry the database id on the token; it is the id every query scopes by. */
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/**
 * The one way server code asks "who is acting?". Returns null when nobody is
 * signed in; callers decide whether that is an error.
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
