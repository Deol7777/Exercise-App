"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthError, AuthField } from "@/features/auth/components/auth-field";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { PillButton } from "@/components/ui/pill-button";
import { signInSchema } from "@/lib/validation/auth";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }

    setPending(true);
    /** redirect: false so a wrong password re-renders this page instead of bouncing through Auth.js's own error page. */
    const result = await signIn("credentials", { ...parsed.data, redirect: false });
    setPending(false);

    if (result?.error) {
      setError("That email and password do not match an account.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <AuthScreen mode="sign-in" title="Welcome back." subtitle="The frog remembers you.">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <AuthField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@den.com"
          required
        />
        <AuthField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
        {error ? <AuthError>{error}</AuthError> : null}
        <PillButton type="submit" disabled={pending} className="mt-1">
          {pending ? "Opening…" : "Enter the den"}
        </PillButton>
      </form>
    </AuthScreen>
  );
}
