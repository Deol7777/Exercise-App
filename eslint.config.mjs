import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import importPlugin from "eslint-plugin-import";

/**
 * The folder boundaries in FOLDER_STRUCTURE.md are enforced here, not by
 * convention. A feature without a zone in the first block below is unenforced —
 * add one when you add a feature.
 */
const FEATURES = ["account", "auth", "history", "home", "progress", "routines", "training"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            // 5.1 — no cross-feature imports. Share it or compose at the route.
            ...FEATURES.map((feature) => ({
              target: `./src/features/${feature}`,
              from: "./src/features",
              except: [`./${feature}`],
            })),

            // 5.2 — unidirectional flow: shared -> features -> app.
            // features/ cannot import from app/.
            { target: "./src/features", from: "./src/app" },
            // shared folders cannot import from features/ or app/.
            {
              target: [
                "./src/components",
                "./src/hooks",
                "./src/lib",
                "./src/server",
                "./src/types",
                "./src/utils",
              ],
              from: ["./src/features", "./src/app"],
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
