/**
 * The one preferences read a rendering request gets.
 *
 * Two callers want this row on every single navigation and they are in
 * different parts of the tree: the root layout, to pick the palette before it
 * writes `data-theme` onto `<html>`, and each page's `requireAccount()`, for the
 * display unit. Both resolved through `getPreferences` directly, so every tab
 * switch issued the same `select weight_unit, theme from users` twice — two WAN
 * round trips to Neon for one row.
 *
 * React's `cache` is per render pass, so routing both through here collapses
 * them to one. It belongs in the app layer rather than in the service: `cache`
 * is a rendering concern, and `src/server/services/**` knows nothing about
 * rendering (it is called from route handlers too, where each request is its
 * own pass anyway).
 */
import { cache } from "react";

import { getPreferences, type Preferences } from "@/server/services/users";

export const currentPreferences: (userId: string) => Promise<Preferences> = cache(getPreferences);
