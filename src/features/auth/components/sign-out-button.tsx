"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

/**
 * Auth.js documents sign-out as a Server Action. ADR 0003 rules those out, so
 * this goes through the client helper instead, which POSTs to the Auth.js
 * route handler at /api/auth/signout — a REST call like every other mutation.
 */
export function SignOutButton() {
  return (
    <Button variant="outline" onClick={() => signOut({ callbackUrl: "/sign-in" })}>
      Sign out
    </Button>
  );
}
