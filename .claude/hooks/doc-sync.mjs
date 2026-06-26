#!/usr/bin/env node
// Stop hook. Verifies that touched source files have matching doc updates.
// Reads .touched-files (populated by PostToolUse hook touched-files-track.mjs).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { readManifest, bumpLastVerified } from "./lib/manifest.mjs";
import { findDomain, matchesAny } from "./lib/match.mjs";

const TRACKER_PATH = ".claude/.touched-files";
const ROT_DAYS = 90;
const ROT_CHANGE_THRESHOLD = 5;

// CLAUDE.md rule 5: business-material source changes must keep README.md + BUSINESS.md
// (the top-level business-status docs) in sync. The per-domain stale check above does NOT
// cover these root docs, so we enforce them here with a curated trigger list. When a touched
// source file matches one of these globs and NEITHER root doc was edited in the same turn,
// the Stop is BLOCKED. These are the files that carry business-level facts a reader of
// BUSINESS.md/README.md relies on (prices/tiers/entries, draw cadence & gating, prize catalog,
// billing/anchor/refund rules, partner catalog, promo/upsell multipliers, ad-tracking providers
// & analytics surfaces, rewards pause, RBAC/staff governance, the coming-soon roadmap).
const BUSINESS_TRIGGER_GLOBS = [
  "src/data/membershipPackages.ts",
  "src/data/upsellPackages.ts",
  "src/data/miniDrawPackages.ts",
  "src/data/partnerBrandOffers.ts",
  "src/data/professions.ts",
  "src/config/prizes.ts",
  "src/config/featureFlags.ts",
  "src/config/rewardsSettings.ts",
  "src/utils/draws/major-draw-gate-http.ts",
  "src/utils/draws/major-draw-helpers.ts",
  "src/utils/billing/**",
  "src/utils/membership/has-additional-package-access.ts",
  "src/services/subscription/RetentionPauseService.ts",
  "src/services/subscription/RetentionDiscountService.ts",
  "src/services/upsell/UpsellMultiplierResolver.ts",
  "src/services/admin/PromoMultiplierResolverService.ts",
  "src/lib/permissions.ts",
  "src/models/Role.ts",
  "src/models/StaffActivity.ts",
  "src/lib/tracking/registry.ts",
  "src/lib/tracking/providers/**",
  "src/lib/tiktok.ts",
  "src/services/facebook-ads-health/**",
];
const BUSINESS_DOCS = ["README.md", "BUSINESS.md"];

// CLAUDE.md rule 5b: CUSTOMER.md (the customer-side companion to BUSINESS.md) must stay in sync with
// customer-material source — the customer data model (User), the lifecycle/state machine, account
// creation & auth, the membership journey (cancel/upgrade/downgrade/reactivate), entries/eligibility,
// perks (partner/referral/affiliate), the marketing data captured about the customer, and the account
// surface. When a touched source file matches one of these globs and CUSTOMER.md was NOT edited in the
// same turn, the Stop is BLOCKED. Mirrors the BUSINESS_TRIGGER mechanism. Add new customer-material
// source paths here when you introduce them.
const CUSTOMER_TRIGGER_GLOBS = [
  "src/models/User.ts",
  "src/contexts/UserContext.tsx",
  "src/models/MembershipStatusHistory.ts",
  "src/models/ReferralEvent.ts",
  "src/services/subscription/**",
  "src/components/auth/**",
  "src/app/api/auth/**",
  "src/lib/auth.ts",
  "src/components/modals/CancellationFlowModal/**",
  "src/components/modals/SubscriptionManagementModal/**",
  "src/utils/giveaway-eligibility.ts",
  "src/utils/payment/subscription-entries-calculator.ts",
  "src/utils/partner-discounts/**",
  "src/lib/referral.ts",
  "src/lib/affiliate.ts",
  "src/services/attribution/**",
  "src/services/klaviyo/**",
  "src/app/(site)/my-account/**",
];
const CUSTOMER_DOCS = ["CUSTOMER.md"];

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
    if (f === "BUSINESS.md" || f === "README.md" || f === "CUSTOMER.md") return false; // top-level status docs track themselves (rule 5 / 5b handled by the trigger checks below)
    return !isTrivialEdit(f);
  });

  if (substantive.length === 0) {
    clearTouched();
    process.exit(0);
  }

  // Business-doc sync check (CLAUDE.md rule 5). If any substantive edit hit a business-material
  // source file and neither README.md nor BUSINESS.md was edited this turn, flag it.
  const businessTriggers = substantive.filter((f) => matchesAny(f, BUSINESS_TRIGGER_GLOBS));
  const businessDocsChanged = BUSINESS_DOCS.some((d) => changedFilesUnder(d).length > 0);
  const businessStale = businessTriggers.length > 0 && !businessDocsChanged;

  // Customer-doc sync check (CLAUDE.md rule 5b). If any substantive edit hit a customer-material
  // source file and CUSTOMER.md was not edited this turn, flag it.
  const customerTriggers = substantive.filter((f) => matchesAny(f, CUSTOMER_TRIGGER_GLOBS));
  const customerDocsChanged = CUSTOMER_DOCS.some((d) => changedFilesUnder(d).length > 0);
  const customerStale = customerTriggers.length > 0 && !customerDocsChanged;

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

  if (businessStale) {
    lines.push("");
    lines.push("STALE BUSINESS DOCS — you edited business-material source but did not update README.md / BUSINESS.md:");
    for (const f of businessTriggers.slice(0, 8)) lines.push(`  - ${f}`);
    if (businessTriggers.length > 8) lines.push(`  ... and ${businessTriggers.length - 8} more`);
    lines.push("");
    lines.push("These files carry top-level business facts (prices/tiers/entries, draw cadence & gating, prize");
    lines.push("catalog, billing/anchor/refund rules, partner catalog, promo/upsell multipliers, ad-tracking,");
    lines.push("rewards pause, RBAC/staff, or the coming-soon roadmap). Per CLAUDE.md rule 5 you MUST update");
    lines.push("README.md and/or BUSINESS.md in the same task when a change flips a fact they assert.");
    lines.push("If your edit genuinely changed NO business-level fact (pure refactor / internal-only), make a");
    lines.push("one-line clarifying touch to the relevant BUSINESS.md section (or note it) so this check passes.");
  }

  if (customerStale) {
    lines.push("");
    lines.push("STALE CUSTOMER DOC — you edited customer-material source but did not update CUSTOMER.md:");
    for (const f of customerTriggers.slice(0, 8)) lines.push(`  - ${f}`);
    if (customerTriggers.length > 8) lines.push(`  ... and ${customerTriggers.length - 8} more`);
    lines.push("");
    lines.push("CUSTOMER.md is the top-level CUSTOMER-context doc (the customer's data model, lifecycle, and flows");
    lines.push("— the companion to BUSINESS.md). Per CLAUDE.md rule 5b you MUST update it in the same task when a");
    lines.push("change flips a fact it asserts: a new/changed User field, a lifecycle-state change, an auth/");
    lines.push("registration change, an entries/eligibility/perks change, or a change to what customer data is");
    lines.push("captured. If your edit changed NO customer-level fact (pure refactor), make a one-line clarifying");
    lines.push("touch to CUSTOMER.md so this check passes.");
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

  if (stale.length > 0 || orphans.length > 0 || businessStale || customerStale) {
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
