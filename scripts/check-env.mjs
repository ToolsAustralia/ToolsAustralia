#!/usr/bin/env node
/**
 * check-env — env discrepancy doctor. READ-ONLY; never prints values (names only).
 *
 * Model (12-factor, adapted for git worktrees):
 *   • .env.example  — the TRACKED source of truth for WHICH vars exist. It merges via
 *                     git, so it's the one canonical registry. Add a var here (with a
 *                     comment + placeholder) whenever the code starts reading a new var.
 *   • .env.local    — per-folder VALUES, GITIGNORED. Main + each worktree have their own;
 *                     git never syncs them. Some vars are legitimately per-folder (PORT,
 *                     test creds) and must NOT be promoted or cross-copied.
 *   • Vercel        — production values, separate again.
 *
 * Discrepancies are detected against .env.example (NOT against other worktrees, which
 * drags in per-folder PORT + branch-local test creds and has no answer for value drift):
 *   • MISSING — a var declared in .env.example but not set in this folder's .env.local
 *               → the app will run without config it expects. Set it.
 *   • EXTRA   — a var in .env.local that isn't in .env.example (and isn't LOCAL_ONLY)
 *               → either the code reads it and it belongs in .env.example (promote it),
 *                 or it's a stray. Never silently ignore.
 *
 * Usage:
 *   node scripts/check-env.mjs          # check the current folder (exit 1 if MISSING)
 *   node scripts/check-env.mjs --all    # check main + every git worktree
 *   node scripts/check-env.mjs --warn   # silent when clean, never fails — wired into predev
 * Exits 1 if any checked folder has MISSING vars (so a hook / CI can gate on it),
 * unless --warn is passed (then it only reports drift and always exits 0).
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// Vars that are legitimately per-folder and must never be promoted to .env.example
// or cross-copied between folders.
const LOCAL_ONLY = new Set([
  "PORT", // wt-new.sh assigns a unique dev port per worktree (3000, 3001, …)
  "E2E_TEST_USER_EMAIL", // branch-local end-to-end test credentials
  "E2E_TEST_USER_PASSWORD",
  "E2E_MONGODB_URI", // per-folder e2e database (name must contain "e2e")
  "E2E_PORT",
  "E2E_TARGET_URL", // per-invocation only (e.g. `E2E_TARGET_URL=... npm run e2e:smoke`) — never persisted to .env.local
]);

/** Uncommented `VAR=` declarations at column 0 (matches how .env files are written). */
function varNames(file) {
  if (!existsSync(file)) return null;
  const names = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

function checkFolder(dir) {
  const example = varNames(join(dir, ".env.example"));
  const local = varNames(join(dir, ".env.local"));
  if (!example) return { dir, skipped: "no .env.example" };
  if (!local) return { dir, skipped: "no .env.local" };
  const missing = [...example].filter((n) => !local.has(n)).sort();
  const extra = [...local].filter((n) => !example.has(n) && !LOCAL_ONLY.has(n)).sort();
  return { dir, missing, extra };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const all = process.argv.includes("--all");
const warn = process.argv.includes("--warn"); // report-only, never fail (for predev)

let dirs;
if (all) {
  // `git worktree list` yields the main working tree + every worktree, regardless of
  // where this runs from. Skip the internal .claude/worktrees/* agent worktrees.
  const out = execSync("git worktree list --porcelain", { cwd: root, encoding: "utf8" });
  dirs = out
    .split(/\r?\n/)
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length).trim())
    .filter((d) => !/[\\/]\.claude[\\/]worktrees[\\/]/.test(d))
    .filter((d) => existsSync(d) && statSync(d).isDirectory());
} else {
  dirs = [process.cwd()];
}

let missingTotal = 0;
let drift = 0;
for (const dir of dirs) {
  const r = checkFolder(dir);
  if (r.skipped) {
    if (!warn) console.log(`•  ${dir}  —  skipped (${r.skipped})`);
    continue;
  }
  if (r.missing.length === 0 && r.extra.length === 0) {
    if (!warn) console.log(`OK ${dir}  —  in sync with .env.example`);
    continue;
  }
  missingTotal += r.missing.length;
  drift++;
  console.log(`${warn ? "⚠ env drift:" : "XX"} ${dir}`);
  if (r.missing.length) console.log(`     MISSING (in .env.example, not set here): ${r.missing.join(", ")}`);
  if (r.extra.length) console.log(`     EXTRA (in .env.local, not in .env.example): ${r.extra.join(", ")}`);
}

if (missingTotal > 0 && !warn) {
  console.log(`\n${missingTotal} missing var(s). Add them to the affected .env.local (value from a worktree that has it, or your secret store), and register new vars in .env.example. See CLAUDE.md §9.`);
}
if (drift > 0 && warn) {
  console.log(`\n(env drift above — run \`npm run check:env\` for detail. This is a warning only; see CLAUDE.md §9.)`);
}
// --warn never fails a build; otherwise MISSING vars are a non-zero exit for gating.
process.exit(!warn && missingTotal > 0 ? 1 : 0);
