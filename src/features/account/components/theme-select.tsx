"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { applyTheme, THEME_META, THEMES, type Theme } from "@/lib/theme";

/**
 * Switches the palette. Nothing about the training data changes — a theme is a
 * block of colour tokens in globals.css and one attribute on <html>.
 *
 * The attribute is written on the spot rather than waiting for the round trip,
 * so the page changes colour as the select closes; the request behind it is
 * what makes the choice survive a reload, and a failure puts both the control
 * and the paint back.
 */
export function ThemeSelect({ theme }: { theme: Theme }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [current, setCurrent] = useState<Theme>(theme);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    const chosen = next as Theme;
    const previous = current;

    setCurrent(chosen);
    applyTheme(chosen);
    setError(null);

    try {
      await apiFetch("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ theme: chosen }),
      });
      /** So the server-rendered <html> agrees with what is already on screen. */
      startRefresh(() => router.refresh());
    } catch (caught) {
      setCurrent(previous);
      applyTheme(previous);
      setError(caught instanceof ApiError ? caught.message : "Could not change the theme.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger id="theme" className="w-56" aria-label="Colour theme">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEMES.map((value) => (
            <SelectItem key={value} value={value}>
              {THEME_META[value].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
