"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";

/**
 * Deleting an account takes every workout with it and cannot be undone, so the
 * confirmation is typing the email address rather than pressing a second
 * button — the point is to make it impossible to do by reflex.
 */
export function DeleteAccountDialog({ email }: { email: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  async function onDelete() {
    setError(null);
    setPending(true);

    try {
      await apiFetch("/api/users/me", { method: "DELETE" });
      /**
       * The JWT stays valid until it expires, so signing out is what actually
       * ends the session for this browser.
       */
      await signOut({ callbackUrl: "/sign-in" });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete the account.");
      setPending(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive w-fit">
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this account?</DialogTitle>
          <DialogDescription>
            Every workout session, exercise entry, set and custom exercise goes with it. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="confirm-email">Type {email} to confirm</FieldLabel>
          <Input
            id="confirm-email"
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={!confirmed || pending} onClick={onDelete}>
            {pending ? "Deleting…" : "Delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
