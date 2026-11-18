import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Deliberately NOT enabling `cacheComponents`: every storefront page reads live stock, and a
   * cached catalogue showing sold-out items is worse than a fast one. If we ever want caching it
   * must be opt-in per component with `use cache` + an explicit tag, not global.
   */

  /**
   * PGlite ships WASM + Node fs calls that Turbopack cannot bundle correctly, and postgres-js
   * prefers to be resolved at runtime. Keeping both external makes dev, build and prod behave the
   * same way.
   */
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
