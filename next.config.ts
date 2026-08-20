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
};

export default nextConfig;
