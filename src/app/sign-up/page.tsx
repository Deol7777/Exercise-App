"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthError, AuthField } from "@/features/auth/components/auth-field";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { PillButton } from "@/components/ui/pill-button";
import { registerSchema } from "@/lib/validation/auth";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }

    setPending(true);
    /**
     * The same schema runs again server-side at the handler edge — this pass is
     * only to save a round trip, never the thing being trusted.
     */
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not create the account.");
      setPending(false);
      return;
    }

    const result = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    setPending(false);

    if (result?.error) {
      /** The account exists; only the automatic sign-in failed. */
      router.push("/sign-in");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <AuthScreen mode="sign-up" title="Join the gym." subtitle="A new beast approaches.">
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
          autoComplete="new-password"
          placeholder="At least 10 characters"
          required
        />
        {error ? <AuthError>{error}</AuthError> : null}
        <PillButton type="submit" disabled={pending} className="mt-1">
          {pending ? "Claiming…" : "Claim your spot"}
        </PillButton>
      </form>
    </AuthScreen>
  );
}
