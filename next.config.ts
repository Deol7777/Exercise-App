import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The dev indicator defaults to the bottom left, which is exactly where the
   * Home tab is. Moving it up keeps the tab bar tappable while developing; it
   * does not ship to production either way.
   */
  devIndicators: {
    position: "top-left",
  },

  experimental: {
    /**
     * How long a visited tab stays reusable in the client router cache.
     *
     * Every route here is request-rendered, and `dynamic` defaults to 0 — so
     * tapping back to the tab you were just on re-ran every query behind it.
     * Thirty seconds is the length of a glance at one tab and back.
     *
     * The cost is real and worth naming: training mutations go through TanStack
     * Query, which invalidates *its* cache and not this one. Anything that
     * changes what another tab shows — starting or finishing a workout — has to
     * call `router.refresh()`, or Home will keep showing the old numbers for up
     * to thirty seconds. `staleTimes` does not affect back/forward navigation.
     */
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
