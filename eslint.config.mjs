import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const internalNormPlugin = require("./eslint/rules/index.js");
const noModelsInClient = require("./eslint/rules/no-models-in-client.js");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // claudeDesign/ = design-handoff reference material (concept HTML/JS), never shipped or imported.
    // ".next-e2e/**" is the e2e harness build dir (next.config.ts distDir). It was
    // added to .gitignore when the builds were split but not here, so a single
    // e2e run put ~22,000 lint problems from compiled output into the report.
    ignores: ["node_modules/**", ".next/**", ".next-e2e/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "claudeDesign/**", "e2e-artifacts/**", "playwright-report/**", "test-results/**"],
  },
  {
    plugins: {
      "internal-norm": internalNormPlugin,
      "local": { rules: { "no-models-in-client": noModelsInClient } },
    },
    rules: {
      // Allow unused vars/args prefixed with _ for intentional placeholders (API signatures, props)
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "internal-norm/norm-must-import-service": "error",
      // loadStripe/getStripePromise must not run at module scope — see src/lib/stripe-client.ts.
      "internal-norm/no-eager-stripe": "error",
      // WARN, not error, deliberately: 57 pre-existing hand-rolled locks remain (Header,
      // AdminPage, RewardsFloatingWidget, WinnersTestimony, the */Shell.tsx family, the admin
      // filter drawers). The rule earns its keep by flagging NEW ones in review and in-editor;
      // flipping it to "error" is the last step of the migration, not the first. Sweeping 57
      // call sites in one unverifiable pass is the blast radius this rule exists to argue against.
      "internal-norm/no-adhoc-scroll-lock": "warn",
      // Server-only Mongoose imports must never land in a "use client" component (runtime crash / bundle bloat).
      "local/no-models-in-client": "error",
    },
  },
  {
    // ESLint custom rule plugin is a CommonJS .js file loaded via createRequire.
    // Disable the no-require-imports rule for this directory since the file MUST use require().
    files: ["eslint/rules/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Operational scripts run through tsx/node, not the bundler, so CommonJS is
    // a legitimate choice there rather than a lapse.
    files: ["scripts/**/*.js", "scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
