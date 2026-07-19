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
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "claudeDesign/**"],
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
];

export default eslintConfig;
