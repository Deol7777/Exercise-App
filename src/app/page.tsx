import Link from "next/link";

import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { WeightUnitSelect } from "@/components/account/weight-unit-select";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/server/auth";
import { isDomainError } from "@/server/errors";
import { getWeightUnit } from "@/server/services/users";

/** A server component may read the session directly; it must not query the database inline. */
export default async function HomePage() {
  const session = await auth();
  /**
   * A JWT can outlive its account (ADR 0007), so a missing user is a signed-out
   * landing page here, not an error.
   */
  const unit = session?.user?.id ? await weightUnitOrNull(session.user.id) : null;
  const signedIn = Boolean(session?.user && unit);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Exercise App</CardTitle>
          <CardDescription>
            {signedIn
              ? "Signed in. Start a workout, or pick up the one in progress."
              : "A workout logger. Sign in to record a session."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {signedIn && session?.user ? (
            <>
              <dl className="text-sm">
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd className="font-medium">{session.user.email}</dd>
                <dt className="text-muted-foreground mt-2">User id</dt>
                <dd className="font-mono text-xs">{session.user.id}</dd>
              </dl>
              {unit ? (
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-sm">Display weights in</span>
                  <WeightUnitSelect unit={unit} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/log">Open the log</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/history">History</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/progress">Progress</Link>
                </Button>
                <SignOutButton />
              </div>
              {session.user.email ? <DeleteAccountDialog email={session.user.email} /> : null}
            </>
          ) : (
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/sign-up">Create account</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

async function weightUnitOrNull(userId: string) {
  try {
    return await getWeightUnit(userId);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") return null;
    throw error;
  }
}
