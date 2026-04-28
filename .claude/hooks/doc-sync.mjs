#!/usr/bin/env node
// Stop hook. Verifies that touched source files have matching doc updates.
// Reads .touched-files (populated by PostToolUse hook touched-files-track.mjs).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { readManifest, bumpLastVerified } from "./lib/manifest.mjs";
import { findDomain } from "./lib/match.mjs";

const TRACKER_PATH = ".claude/.touched-files";
const ROT_DAYS = 90;
const ROT_CHANGE_THRESHOLD = 5;

function readTouched() {
  if (!fs.existsSync(TRACKER_PATH)) return [];
  const content = fs.readFileSync(TRACKER_PATH, "utf8");
  return [...new Set(content.split("\n").map((l) => l.trim()).filter(Boolean))];
}

function clearTouched() {
  if (fs.existsSync(TRACKER_PATH)) fs.unlinkSync(TRACKER_PATH);
}

/**
 * Determine if a file edit is trivia (comments-only, whitespace-only, import-order-only).
 * Uses git diff to inspect actual changes. If file is new (no diff against HEAD), not trivia.
 */
function isTrivialEdit(filePath) {
  try {
    const diff = execSync(`git diff -U0 -- "${filePath}"`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    if (!diff) return true; // No unstaged change (already staged/committed) → ignore.
    const changedLines = diff
      .split("\n")
      .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
      .map((l) => l.slice(1).trim());
    if (changedLines.length === 0) return true;
    return changedLines.every(
      (l) =>
        l === "" ||
        l.startsWith("//") ||
        l.startsWith("/*") ||
        l.startsWith("*") ||
        l.startsWith("*/") ||
        /^import\s/.test(l) ||
        /^export\s+\*\s+from/.test(l),
    );
  } catch {
    return false; // On error, treat as substantive (safer).
  }
}

/**
 * Get list of files modified in working tree (staged or unstaged) under a path prefix.
 */
function changedFilesUnder(prefix) {
  try {
    const out = execSync(`git status --porcelain -- "${prefix}"`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

/**
 * Get count of commits touching a path glob in the last N days.
 */
function commitCountSince(pathGlob, sinceIso) {
  try {
    const out = execSync(
      `git log --since="${sinceIso}" --oneline -- "${pathGlob}"`,
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00Z").getTime();
  const b = new Date(isoB + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

async function main() {
  // Read Stop event input (we don't strictly need it but consume to be polite).
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event = {};
  try { event = JSON.parse(raw); } catch {}

  // Avoid recursive blocking: if hook was already invoked once this turn and Claude is retrying, allow.
  if (event?.stop_hook_active) {
    process.exit(0);
  }

  const touched = readTouched();
  if (touched.length === 0) process.exit(0);

  const repoRoot = process.cwd();
  let manifest;
  try {
    manifest = readManifest(repoRoot);
  } catch (e) {
    process.stderr.write(`doc-sync: cannot read Domain Manifest from CLAUDE.md: ${e.message}\n`);
    process.exit(0); // Soft-fail; do not block Claude on infra errors.
  }

  // Filter out trivia and docs themselves and config-only edits.
  const substantive = touched.filter((f) => {
    if (f.startsWith("docs/")) return false;     // editing docs is not "code change"
    if (f.startsWith(".claude/")) return false;  // hook/skill edits don't need doc updates
    if (f === "CLAUDE.md") return false;         // CLAUDE.md edits track themselves
    return !isTrivialEdit(f);
  });

  if (substantive.length === 0) {
    clearTouched();
    process.exit(0);
  }

  // Group by domain.
  const affected = new Map(); // domain -> string[] of files
  const orphans = [];
  for (const f of substantive) {
    const d = findDomain(manifest, f);
    if (d) {
      if (!affected.has(d)) affected.set(d, []);
      affected.get(d).push(f);
    } else {
      orphans.push(f);
    }
  }

  // Check each affected domain: were docs/<domain>/ files also changed?
  const stale = [];
  const fresh = [];
  for (const [domain, files] of affected) {
    const docsPath = manifest.domains[domain].docs;
    const docChanges = changedFilesUnder(docsPath);
    if (docChanges.length === 0) {
      stale.push({ domain, files, docsPath });
    } else {
      fresh.push(domain);
    }
  }

  // Build the message.
  const lines = [];

  if (orphans.length > 0) {
    lines.push("");
    lines.push("ORPHAN FILES — these source files do not match any domain in the Domain Manifest:");
    for (const o of orphans) lines.push(`  - ${o}`);
    lines.push("");
    lines.push("Add them to an existing domain's `paths` in CLAUDE.md, or define a new domain.");
  }

  if (stale.length > 0) {
    lines.push("");
    lines.push("STALE DOCS — you edited code in these domains but did not update their documentation:");
    for (const { domain, files, docsPath } of stale) {
      lines.push(`  • ${domain} (docs: ${docsPath})`);
      for (const f of files.slice(0, 5)) lines.push(`      - ${f}`);
      if (files.length > 5) lines.push(`      ... and ${files.length - 5} more`);
    }
    lines.push("");
    lines.push("Update the relevant files inside each domain's docs folder before finishing.");
    lines.push("Typical mapping:");
    lines.push("  - new/modified API route → docs/<domain>/api.md");
    lines.push("  - new/modified Mongo model → docs/<domain>/models.md");
    lines.push("  - new/modified component or hook → docs/<domain>/frontend.md");
    lines.push("  - new/modified service / business rule → docs/<domain>/backend.md");
    lines.push("  - bug fix from an incident → docs/<domain>/gotchas.md");
  }

  // Rot detection — flag fresh domains that haven't been verified in a while.
  const today = todayIso();
  const rotted = [];
  for (const domain of fresh) {
    const lv = manifest.domains[domain].lastVerified;
    if (!lv) continue;
    const days = daysBetween(lv, today);
    if (days < ROT_DAYS) continue;
    const commits = commitCountSince(`src/`, `${days} days ago`);
    if (commits >= ROT_CHANGE_THRESHOLD) {
      rotted.push({ domain, days, commits });
    }
  }
  if (rotted.length > 0) {
    lines.push("");
    lines.push("DOC ROT — these domains were updated this session, but their last full verification is old:");
    for (const r of rotted) {
      lines.push(`  - ${r.domain}: lastVerified ${r.days} days ago, ${r.commits} commits since`);
    }
    lines.push("Consider running `/doc-domain <name>` to do a deeper refresh.");
  }

  if (stale.length > 0 || orphans.length > 0) {
    process.stderr.write(
      `BLOCKED: Documentation is out of sync with code changes.\n${lines.join("\n")}\n\n` +
      `After updating the docs, your Stop will be allowed.\n`,
    );
    // Do NOT clear .touched-files — let the next Stop re-evaluate.
    process.exit(2);
  }

  // All clean — bump lastVerified for each fresh domain and clear tracker.
  for (const domain of fresh) {
    try { bumpLastVerified(repoRoot, domain, today); } catch {}
  }

  if (rotted.length > 0) {
    // Non-blocking notice (printed to stdout, which Claude Code shows as transcript output).
    process.stdout.write(lines.join("\n") + "\n");
  }

  clearTouched();
  process.exit(0);
}

main().catch((e) => {
  // Soft-fail on internal errors — don't block Claude on hook bugs.
  process.stderr.write(`doc-sync: internal error: ${e.message}\n`);
  process.exit(0);
});
