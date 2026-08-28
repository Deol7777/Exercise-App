/**
 * Colour themes.
 *
 * A theme is a *presentation* preference, the same shape as the display unit
 * in src/lib/weight.ts: it is stored on the user, read on the server, and
 * applied as one attribute on <html>. Every screen is built out of the role
 * tokens in globals.css (--background, --card, --brand, ...), so a theme is a
 * block of token values and nothing else — no component knows a theme exists.
 *
 * Client-safe on purpose: the schema, the Zod schema and the settings control
 * all read this list, so it imports nothing from src/server/**.
 */
export const THEMES = ["rose", "rose-dark", "ink", "forest", "cobalt", "court"] as const;

export type Theme = (typeof THEMES)[number];

/** The palette the app was designed in (references/color.png). */
export const DEFAULT_THEME: Theme = "rose";

/**
 * `dark` drives two things a token block cannot: the `dark` class that
 * shadcn's `dark:` utilities key on (`@custom-variant dark` in globals.css),
 * and `color-scheme`, which is what makes form controls and scrollbars follow
 * the page instead of staying light. `themeColor` is the browser chrome, and
 * must be the theme's own `--background` or the status bar reads as a seam.
 */
export const THEME_META: Record<Theme, { label: string; dark: boolean; themeColor: string }> = {
  rose: { label: "Evening rose", dark: false, themeColor: "#F7F1F1" },
  "rose-dark": { label: "Evening rose, dark", dark: true, themeColor: "#1B1718" },
  ink: { label: "Chalk and ink", dark: false, themeColor: "#F4F4F2" },
  forest: { label: "Bone and forest", dark: false, themeColor: "#F2F1EA" },
  cobalt: { label: "Graphite and cobalt", dark: false, themeColor: "#F1F2F5" },
  court: { label: "Night court", dark: true, themeColor: "#16171B" },
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Paints a theme onto the document that is already on screen.
 *
 * The server renders these same three things into the HTML (src/app/layout.tsx)
 * — this exists so the switch in Settings lands on the pixel the select is
 * released, rather than after the refresh that persists it.
 */
export function applyTheme(theme: Theme): void {
  const { dark, themeColor } = THEME_META[theme];
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}
