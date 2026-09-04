#!/usr/bin/env node
/**
 * check-test-scripts — every tracked *.test.ts must be reachable from an npm script.
 *
 * This repo has NO test runner. "Tests" are standalone tsx scripts, each wired to its
 * own `test:*` entry in package.json, and CI iterates those entries. So a test file
 * with no matching script does not run anywhere, ever — and nothing says so. It is
 * the quietest possible failure: the file exists, it looks like coverage in a code
 * review, and it has never been executed.
 *
 * That is not hypothetical. src/utils/integrations/klaviyo/__tests__/bulk-import.test.ts
 * sat unwired and passing for months; this check is what found it.
 *
 * READ-ONLY. Names only, no execution.
 *
 * Usage:  npm run check:test-scripts
 * Docs:   docs/dev-tooling/ci.md
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const testFiles = execSync("git ls-files src scripts e2e", { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter((f) => /\.test\.ts$/.test(f))
  // e2e specs are driven by Playwright's own discovery, not by npm scripts.
  .filter((f) => !f.startsWith("e2e/"));

const scripts = JSON.parse(readFileSync(`${root}/package.json`, "utf8")).scripts;

// Collect every .ts path any script mentions. A suite may be referenced from a
// script that chains several invocations, so scan all of them, not just test:*.
const referenced = new Set();
for (const command of Object.values(scripts)) {
  for (const m of command.matchAll(/[^\s"']+\.ts/g)) {
    referenced.add(m[0].split("\\").join("/"));
  }
}

const orphans = testFiles.filter((f) => {
  for (const r of referenced) {
    if (r === f || f.endsWith(r) || r.endsWith(f)) return false;
  }
  return true;
});

console.log(`${testFiles.length} tracked test files, ${Object.keys(scripts).filter((k) => k.startsWith("test:")).length} test:* scripts`);

if (orphans.length === 0) {
  console.log("OK — every test file is reachable from an npm script.");
  process.exit(0);
}

console.log(`\nXX ${orphans.length} test file(s) that no npm script runs:`);
for (const o of orphans) console.log(`     ${o}`);
console.log(
  `\nThis repo has no test runner, so a file with no \`test:*\` entry never executes —\n` +
    `it looks like coverage in review and has never run. Add an entry to package.json:\n` +
    `     "test:<short-name>": "tsx <path>"\n` +
    `and add it to the CI baseline in .github/scripts/run-test-suites.sh.`
);
process.exit(1);
