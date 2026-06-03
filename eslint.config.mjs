import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const internalNormPlugin = require("./eslint/rules/index.js");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"],
  },
  {
    plugins: {
      "internal-norm": internalNormPlugin,
    },
    rules: {
      // Allow unused vars/args prefixed with _ for intentional placeholders (API signatures, props)
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "internal-norm/norm-must-import-service": "error",
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
