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
 *   • UNREGISTERED — (--registry) a var the CODE reads that .env.example never declares
 *               → production reads `undefined` and behaves plausibly wrong, silently.
 *                 This is the direction CI checks, because it needs no .env.local.
 *
 * Usage:
 *   node scripts/check-env.mjs             # check the current folder (exit 1 if MISSING)
 *   node scripts/check-env.mjs --all       # check main + every git worktree
 *   node scripts/check-env.mjs --warn      # silent when clean, never fails — wired into predev
 *   node scripts/check-env.mjs --registry  # code reads vs .env.example — the CI check
 * Exits 1 if any checked folder has MISSING vars (so a hook / CI can gate on it),
 * unless --warn is passed (then it only reports drift and always exits 0).
 *
 * MARKING A VAR OPTIONAL
 * Put the token [optional] in the comment block directly above a declaration:
 *
 *     # Verbose Klaviyo payload logging. [optional]
 *     KLAVIYO_DEBUG_PROFILE=
 *
 * An optional var is still REGISTERED (so --registry is satisfied and the var is
 * discoverable) but is never reported MISSING when a folder does not set it. Without
 * this, registering a debug flag makes `npm run check:env` exit 1 in the main folder
 * and every worktree, and go noisy on every `predev` — which is how a var ends up
 * unregistered in the first place.
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

// Injected by the hosting platform at runtime. The code may read them, but they must
// never be declared in .env.example — nobody sets these by hand, and listing them
// would make `check:env` demand them in every folder forever.
const PLATFORM_INJECTED = new Set([
  "NODE_ENV", // set by next/node itself
  "VERCEL", // "1" on any Vercel runtime
  "VERCEL_ENV", // production | preview | development
  "VERCEL_REGION",
  "VERCEL_URL", // per-deployment hostname
  "CI", // set by GitHub Actions
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

/**
 * Declarations whose preceding contiguous comment block carries the [optional] token.
 * Registered, but never demanded of a folder. See the header for why this exists.
 */
function optionalNames(file) {
  if (!existsSync(file)) return new Set();
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const names = new Set();
  const isDecl = (l) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(lines[i]);
    if (!m) continue;
    let j = i - 1;
    // Related vars are commonly declared as a run under ONE shared comment block:
    //     # Direct SMTP fallback … [optional]
    //     SMTP_SERVER_HOST=
    //     SMTP_SERVER_PORT=
    // so walk back over sibling declarations before looking for the block. Stopping
    // at the first non-comment line marked only the first var of every group.
    while (j >= 0 && isDecl(lines[j])) j--;
    for (; j >= 0; j--) {
      const prev = lines[j].trim();
      if (prev === "" || !prev.startsWith("#")) break;
      if (/\[optional\]/i.test(prev)) {
        names.add(m[1]);
        break;
      }
    }
  }
  return names;
}

function checkFolder(dir) {
  const example = varNames(join(dir, ".env.example"));
  const local = varNames(join(dir, ".env.local"));
  if (!example) return { dir, skipped: "no .env.example" };
  if (!local) return { dir, skipped: "no .env.local" };
  const optional = optionalNames(join(dir, ".env.example"));
  const missing = [...example].filter((n) => !local.has(n) && !optional.has(n)).sort();
  const extra = [...local].filter((n) => !example.has(n) && !LOCAL_ONLY.has(n)).sort();
  return { dir, missing, extra };
}

/**
 * --registry: every var the CODE reads must be declared in .env.example.
 *
 * This is the direction CI can check, because it needs no .env.local — only the
 * tracked source and the tracked registry. CLAUDE.md §9 makes .env.example the
 * single source of truth for WHICH vars exist, and there is no runtime validation,
 * so an unregistered var means production silently reads `undefined`.
 *
 * The reverse direction (declared but never read) is deliberately NOT enforced: a
 * grep over src/ is not proof of disuse in this repo, where GTM and the Vercel
 * dashboard inject values the code never names.
 */
function checkRegistry(rootDir) {
  const files = execSync("git ls-files src scripts", { cwd: rootDir, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => /\.(ts|tsx|mjs|js|cjs)$/.test(f));

  const reads = new Map(); // NAME -> Set(file)
  const dynamic = new Set(); // files doing process.env[expr] with a non-literal key
  const note = (name, file) => {
    if (!reads.has(name)) reads.set(name, new Set());
    reads.get(name).add(file);
  };

  for (const f of files) {
    const text = readFileSync(join(rootDir, f), "utf8");
    for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) note(m[1], f);
    // Bracket form with a literal key — 15 of these exist, 2 in production code.
    for (const m of text.matchAll(/process\.env\[\s*(["'`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g)) note(m[2], f);
    // Bracket form with a computed key. Cannot be resolved statically, so it is
    // REPORTED rather than passed over — a dynamically named secret would otherwise
    // slip through this check silently.
    for (const _ of text.matchAll(/process\.env\[\s*(?!["'`])[^\]]/g)) dynamic.add(f);
  }

  const declared = varNames(join(rootDir, ".env.example")) ?? new Set();
  const unregistered = [...reads.keys()]
    .filter((n) => !declared.has(n) && !LOCAL_ONLY.has(n) && !PLATFORM_INJECTED.has(n))
    .sort();

  return { files: files.length, distinct: reads.size, declared: declared.size, unregistered, reads, dynamic };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const all = process.argv.includes("--all");
const warn = process.argv.includes("--warn"); // report-only, never fail (for predev)
const registry = process.argv.includes("--registry");

if (registry) {
  const r = checkRegistry(root);
  console.log(`scanned ${r.files} tracked files under src/ and scripts/`);
  console.log(`  ${r.distinct} distinct env vars read in code`);
  console.log(`  ${r.declared} declared in .env.example`);

  if (r.dynamic.size > 0) {
    console.log(`\n${r.dynamic.size} file(s) read process.env with a computed key — this check cannot see those names:`);
    for (const f of [...r.dynamic].sort()) console.log(`     ${f}`);
  }

  if (r.unregistered.length === 0) {
    console.log(`\nOK — every env var the code reads is registered in .env.example.`);
    process.exit(0);
  }

  console.log(`\nXX ${r.unregistered.length} var(s) read by the code but NOT declared in .env.example:`);
  for (const n of r.unregistered) {
    const where = [...r.reads.get(n)].sort().slice(0, 3);
    console.log(`     ${n}`);
    for (const f of where) console.log(`         ${f}`);
    if (r.reads.get(n).size > where.length) console.log(`         …and ${r.reads.get(n).size - where.length} more`);
  }
  console.log(
    `\n.env.example is the single source of truth for WHICH vars exist (CLAUDE.md §9), and there is no\n` +
      `runtime validation — an unregistered var means production reads \`undefined\` and behaves plausibly\n` +
      `wrong, with nothing to notice it. Declare each one above with a comment and a SAFE placeholder\n` +
      `(never a real secret). If it is only ever set by a developer for debugging, add the [optional]\n` +
      `token to its comment so it is registered without being demanded of every folder.`
  );
  process.exit(1);
}

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
