import type { MetadataRoute } from "next";

import { THEME_META } from "@/lib/theme";

/**
 * The install manifest — what a phone reads when someone taps "Add to Home
 * Screen". Next links it from every page automatically because this file
 * exists; there is no <link> to add.
 *
 * The colours are the default `rose` theme's and cannot be per-user: the
 * manifest is fetched once at install time, without the session cookie, and
 * whatever it said then is baked into the installed shortcut. `themeColor` in
 * generateViewport is the one that does follow the user, and it is the one
 * that paints the status bar on every launch — so a person on a dark theme
 * gets a dark app with a light splash for the half second before it renders,
 * not a light app.
 *
 * `id` is fixed so a later change to `start_url` updates the installed app
 * rather than offering itself as a second one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Exercise App",
    // What fits under the icon on a home screen. Anything past ~12 characters
    // is elided there, so this is not the place for the long name.
    short_name: "Exercise",
    description:
      "A workout logger: record a training session set by set, then read it back as progress.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_META.rose.themeColor,
    theme_color: THEME_META.rose.themeColor,
    icons: [
      // One square, declared twice. The mark sits inside the 80% safe circle
      // Android crops a maskable icon to, so the padded variant a maskable
      // icon usually needs would be the same pixels.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
