/**
 * Which palette to draw this request in.
 *
 * The root layout renders it onto <html>, and `generateViewport` needs the same
 * answer for the browser-chrome colour, so it is wrapped in React's `cache` —
 * both callers run inside one render pass and share the single read.
 *
 * Signed out, or signed in with a token whose account is gone (ADR 0007), is
 * the default palette rather than an error: this decides a colour, and a colour
 * is not worth a redirect. The page underneath still does its own check.
 */
import { cache } from "react";

import { DEFAULT_THEME, type Theme } from "@/lib/theme";
import { currentUserId } from "@/server/auth";
import { isDomainError } from "@/server/errors";

import { currentPreferences } from "./preferences";

export const currentTheme = cache(async (): Promise<Theme> => {
  const userId = await currentUserId();
  if (!userId) return DEFAULT_THEME;

  try {
    /** Through `currentPreferences`, not `getTheme`, so the page's own read of
     *  the same row later in this pass is free rather than a second query. */
    return (await currentPreferences(userId)).theme;
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") return DEFAULT_THEME;
    throw error;
  }
});
