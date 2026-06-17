#!/usr/bin/env node
// Stop hook — type-check + lint gate.
//
// Goal: surface bugs THIS session introduced before the turn is reported done —
// the automated backstop for the repo's largest friction class (regressions
// reaching the user). It also enforces the `local/no-models-in-client` lint guard
// (server-only Mongoose imports in client code).
//
// Scope discipline (important): this worktree is shared by concurrent sessions and
// can carry pre-existing type errors that are NOT this session's fault. So the gate
// keys off `.claude/.touched-files` (the files THIS session edited, populated by the
// touched-files-track PostToolUse hook) and only blocks on:
//   - tsc errors located IN a file this session touched, and
//   - eslint errors on the files this session touched.
// Pre-existing errors and other sessions' files are ignored. Whole-program coverage
// still happens in /ship, /review, and CI.
//
// Fail-open everywhere (missing tracker, hook bug, eslint config error → never block).
// Loop-bounded via an attempt counter so a stubborn error can't wedge the session.
// Ordered BEFORE doc-sync in settings.json so it reads .touched-files before doc-sync
// clears it.

import fs from "node:fs";
import process from "node:process";
import { execSync } from "node:child_process";

const TRACKER_PATH = ".claude/.touched-files";
const ATTEMPTS_PATH = ".claude/.typecheck-gate-attempts";
const MAX_ATTEMPTS = 3;

function readAttempts() {
  try {
    return parseInt(fs.readFileSync(ATTEMPTS_PATH, "utf8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}
function writeAttempts(n) {
  try {
    fs.writeFileSync(ATTEMPTS_PATH, String(n));
  } catch {}
}
function resetAttempts() {
  try {
    fs.unlinkSync(ATTEMPTS_PATH);
  } catch {}
}

// .ts/.tsx files under src/ or scripts/ that THIS session edited and that still exist.
function touchedTsFiles() {
  let raw;
  try {
    raw = fs.readFileSync(TRACKER_PATH, "utf8");
  } catch {
    return [];
  }
  const files = [];
  for (const line of raw.split("\n")) {
    const p = line.trim().replace(/\\/g, "/");
    if (!p) continue;
    if (!/^(src|scripts)\//.test(p)) continue;
    if (!/\.(ts|tsx)$/.test(p)) continue;
    if (!fs.existsSync(p)) continue; // skip deleted/renamed-away files
    files.push(p);
  }
  return [...new Set(files)];
}

function run(cmd) {
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event = {};
  try {
    event = JSON.parse(raw);
  } catch {}

  // A fresh (user-initiated) Stop starts a new attempt chain.
  if (!event?.stop_hook_active) resetAttempts();

  const files = touchedTsFiles();
  if (files.length === 0) {
    resetAttempts();
    process.exit(0); // this session touched no checkable TS (e.g. a pure-conversation turn)
  }
  const touched = new Set(files);

  const problems = [];

  // 1) Whole-program type-check (incremental, ~5s), but only block on errors whose file
  //    THIS session touched. Pre-existing errors in untouched files are ignored.
  const tsc = run("npm run type-check --silent");
  if (tsc.status !== 0) {
    const mine = tsc.out.split("\n").filter((line) => {
      const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+error TS/);
      if (!m) return false;
      return touched.has(m[1].replace(/\\/g, "/"));
    });
    if (mine.length) {
      problems.push(`TYPE ERRORS in files you edited (tsc --noEmit):\n${mine.join("\n")}`);
    }
  }

  // 2) Lint the touched files (fast, and enforces local/no-models-in-client).
  const lint = run(`npx eslint ${files.map((f) => `"${f}"`).join(" ")}`);
  if (lint.status === 1) {
    problems.push(`LINT ERRORS (eslint):\n${lint.out.trim()}`);
  } else if (lint.status === 2) {
    // eslint itself failed to run (config/parse error) — surface but do not block on it.
    process.stderr.write(
      `typecheck-gate: eslint did not run cleanly (exit 2) — not blocking on it.\n${lint.out}\n`,
    );
  }

  if (problems.length === 0) {
    resetAttempts();
    process.exit(0);
  }

  const attempts = readAttempts() + 1;
  writeAttempts(attempts);

  if (attempts > MAX_ATTEMPTS) {
    resetAttempts();
    process.stderr.write(
      `typecheck-gate: still failing after ${MAX_ATTEMPTS} attempts — letting the Stop through so the ` +
        `session is not wedged. Fix the following manually or via /ship:\n\n${problems.join("\n\n")}\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `BLOCKED: type-check / lint gate failed (attempt ${attempts}/${MAX_ATTEMPTS}) — fix before finishing.\n\n` +
      `${problems.join("\n\n")}\n\n` +
      `These are scoped to files you edited this session. Fix them, then stop again to re-verify.\n`,
  );
  process.exit(2);
}

main().catch((e) => {
  // Never wedge the session on a hook bug.
  process.stderr.write(`typecheck-gate: internal error (not blocking): ${e.message}\n`);
  process.exit(0);
});
