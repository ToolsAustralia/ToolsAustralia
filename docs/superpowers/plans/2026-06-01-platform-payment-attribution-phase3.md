# Platform Payment Attribution — Phase 3 (Backfill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Also consult superpowers/skill **writing-ops-script** for the repo's backfill conventions. Steps use checkbox (`- [ ]`).
>
> **Commits:** Honor CLAUDE.md hard-rule #1 — commit only if authorized this session.
>
> **Tests:** `tsx` scripts, relative imports, `node:assert/strict`, end with `console.log("...passed")`.
>
> **Prereq:** Phases 1 (`02ad0629`) and 2 (`e84aff2d`) present. This consumes `PaymentEvent.convertingPlatform`/`attributionConfidence`/`isRenewal` and `src/services/attribution/{normalizePlatform,classifyIsRenewal}`.

**Goal:** Populate `convertingPlatform` / `attributionConfidence` / `isRenewal` on **historical** `BenefitsGranted` PaymentEvents (rows where `convertingPlatform` is `null`), deriving the platform from the data we *do* have on old rows (`data.utmSource`/`utmMedium`, the indexed `attribution*` ad-IDs, `data.billingReason`) — tagged `attributionConfidence: "inferred_backfill"` so the dashboard never confuses it with live click-verified attribution.

**Architecture:** A pure, unit-tested derivation helper (`deriveBackfillAttribution`) maps an old row's fields to a `(convertingPlatform, attributionConfidence, isRenewal)` triple. A standalone `tsx` backfill script streams `convertingPlatform: null` rows via a Mongo cursor, applies the helper, and `updateOne`s each row — `--dry-run` by default-safe, append-mode CSV audit log, 3-tier exit codes — mirroring `scripts/backfill-klaviyo-membership-properties.ts` (commit `c9ea0220`). Idempotent: the `convertingPlatform: null` filter means re-runs only touch un-backfilled rows.

**Tech Stack:** `tsx`, Mongoose, dotenv. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-01-platform-payment-attribution-design.md` §3.6 / D4.

---

## Derivation precedence (the contract)

For each historical `BenefitsGranted` row with `convertingPlatform == null`:
1. `normalizeUtmToPlatform(data.utmSource, data.utmMedium)` — same normalizer the live resolver uses (de-aliases `Facebook`→`meta`, splits `klaviyo`+medium, etc.). Returns a platform, `"other"`, or `null` (no `utm_source`).
2. If `null` (no `utm_source`): fall back to the indexed **Meta-shaped** ad attribution — if any of `attributionAdId` / `attributionAdsetId` / `attributionCampaignId` is set, the row came from a Meta ad → `"meta"`; otherwise `"direct"`.
3. `attributionConfidence` is **always `"inferred_backfill"`** for every backfilled row (we inferred from URL/UTM data without click verification — never `click`/`utm_only`, which are reserved for the live path).
4. `isRenewal = classifyIsRenewal({ billingReason: data.billingReason })` (historical rows lack `isResubscribe` context — acceptable, documented imprecision: a historical resubscribe-cycle reads as a renewal).

**Idempotency & non-overwrite:** the script only queries `convertingPlatform: null`, so it never overwrites a live-resolved (`click`/`utm_only`) row or a previously-backfilled row. Re-runs are safe and converge.

---

## File Structure
**Create:**
- `src/services/attribution/deriveBackfillAttribution.ts` — pure helper (manifest: `tracking` domain via `src/services/attribution/**`).
- `src/services/attribution/__tests__/deriveBackfillAttribution.test.ts`
- `scripts/backfill-converting-platform.ts` — the backfill (manifest: `infrastructure` via `scripts/backfill-*.ts`).
**Modify:**
- `package.json` — `test:derive-backfill-attribution`, `backfill:converting-platform`, `backfill:converting-platform:dry`.
- `docs/tracking/backend.md` (helper) + `docs/infrastructure/*` (script) — doc-sync.
- `docs/PAYMENT_ATTRIBUTION.md` — backfill subsection.

---

## Task 1: Pure derivation helper + test

**Files:** `src/services/attribution/deriveBackfillAttribution.ts`, `src/services/attribution/__tests__/deriveBackfillAttribution.test.ts`, `package.json`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { deriveBackfillAttribution } from "../deriveBackfillAttribution";

// utm_source normalizes (with casing) → platform
{
  const r = deriveBackfillAttribution({ utmSource: "Facebook" });
  assert.equal(r.convertingPlatform, "meta");
  assert.equal(r.attributionConfidence, "inferred_backfill");
}
// klaviyo splits by medium
assert.equal(deriveBackfillAttribution({ utmSource: "klaviyo", utmMedium: "sms" }).convertingPlatform, "klaviyo_sms");
// no utm_source but Meta ad-id present → meta
assert.equal(deriveBackfillAttribution({ hasMetaAdAttribution: true }).convertingPlatform, "meta");
// no signal at all → direct
assert.equal(deriveBackfillAttribution({}).convertingPlatform, "direct");
// unknown source → other
assert.equal(deriveBackfillAttribution({ utmSource: "newsletter" }).convertingPlatform, "other");
// confidence is ALWAYS inferred_backfill, even with a clear source
assert.equal(deriveBackfillAttribution({ utmSource: "tiktok" }).attributionConfidence, "inferred_backfill");
// isRenewal from billingReason
assert.equal(deriveBackfillAttribution({ billingReason: "subscription_cycle" }).isRenewal, true);
assert.equal(deriveBackfillAttribution({ billingReason: "subscription_create" }).isRenewal, false);
assert.equal(deriveBackfillAttribution({}).isRenewal, false);

console.log("deriveBackfillAttribution: all assertions passed");
```

- [ ] **Step 2: Add the script + run to confirm fail**

`"test:derive-backfill-attribution": "tsx src/services/attribution/__tests__/deriveBackfillAttribution.test.ts"`. Run → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/services/attribution/deriveBackfillAttribution.ts
// Pure derivation for the historical backfill (spec §3.6 / D4). Maps an OLD
// PaymentEvent's available fields to a single-platform decision. Confidence is
// ALWAYS "inferred_backfill" — these rows predate click-ID capture, so they can
// never be click/utm_only (which the live resolver reserves).
import type { ConvertingPlatform } from "@/types/attribution";
import { normalizeUtmToPlatform } from "./normalizePlatform";
import { classifyIsRenewal } from "./classifyIsRenewal";

export interface BackfillSourceRow {
  utmSource?: string | null;
  utmMedium?: string | null;
  billingReason?: string | null;
  /** True when any indexed Meta-shaped ad-id (attributionAdId/AdsetId/CampaignId) is set. */
  hasMetaAdAttribution?: boolean;
}

export function deriveBackfillAttribution(row: BackfillSourceRow): {
  convertingPlatform: ConvertingPlatform;
  attributionConfidence: "inferred_backfill";
  isRenewal: boolean;
} {
  let platform = normalizeUtmToPlatform(row.utmSource, row.utmMedium);
  if (platform == null) {
    // No utm_source — Meta ad-ids are the only other historical signal.
    platform = row.hasMetaAdAttribution ? "meta" : "direct";
  }
  return {
    convertingPlatform: platform,
    attributionConfidence: "inferred_backfill",
    isRenewal: classifyIsRenewal({ billingReason: row.billingReason ?? undefined }),
  };
}
```

- [ ] **Step 4: Run → PASS.** Type-check → PASS.
- [ ] **Step 5: Commit** (if authorized): `feat(attribution): add pure backfill derivation helper`

---

## Task 2: The backfill script

**Files:** `scripts/backfill-converting-platform.ts`

> Mirror `scripts/backfill-klaviyo-membership-properties.ts` structure EXACTLY: dotenv-first, lazy imports, append-mode CSV with per-row flush + header-if-empty, `csvEscape`/`formatDuration` helpers, SIGINT abort flag, outer try/catch around the cursor, per-row try/catch, progress log, summary, 3-tier exit codes (0/2/3) + unhandled-catch (1).

- [ ] **Step 1: Write the script**

```ts
#!/usr/bin/env npx tsx
/**
 * Backfill convertingPlatform / attributionConfidence / isRenewal onto HISTORICAL
 * BenefitsGranted PaymentEvents (rows where convertingPlatform is null — i.e. created
 * before the Phase-1 attribution feature). Derives from data.utmSource/utmMedium, the
 * indexed attribution* ad-ids, and data.billingReason. ALL backfilled rows are tagged
 * attributionConfidence="inferred_backfill" so the dashboard separates them from live
 * click/utm_only attribution.
 *
 * Idempotent & non-destructive: queries ONLY {convertingPlatform: null}, so it never
 * overwrites a live-resolved row or a previously-backfilled row. Re-runs converge.
 *
 * Usage:
 *   npx tsx scripts/backfill-converting-platform.ts [--dry-run] [--limit=N]
 *                                                   [--batch-size=N] [--csv-path=PATH] [--no-csv]
 *   --dry-run   Compute + log + CSV the decisions; do NOT write. Run this first.
 *   --limit=N   Stop after N rows.
 *   --batch-size=N  Mongo cursor batch size (default 500).
 *
 * Exit: 0 clean · 2 per-row errors · 3 outer/fatal · 1 unhandled.
 * Env: .env.local must have MONGODB_URI.
 * @module scripts/backfill-converting-platform
 */
import { config } from "dotenv";
import * as fs from "fs";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const NO_CSV = process.argv.includes("--no-csv");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;
const BATCH_SIZE_ARG = process.argv.find((a) => a.startsWith("--batch-size="));
const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split("=")[1], 10) : 500;
const CSV_PATH_ARG = process.argv.find((a) => a.startsWith("--csv-path="));
const CSV_PATH = CSV_PATH_ARG
  ? CSV_PATH_ARG.split("=").slice(1).join("=")
  : path.resolve(process.cwd(), `backfill-converting-platform-${DRY_RUN ? "dry-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Error) s = value.message;
  else if (typeof value === "object") { try { s = JSON.stringify(value); } catch { s = String(value); } }
  else s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function main() {
  const connectDB = (await import("../src/lib/mongodb")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const { deriveBackfillAttribution } = await import("../src/services/attribution/deriveBackfillAttribution");

  await connectDB();

  let csvStream: fs.WriteStream | null = null;
  if (!NO_CSV) {
    try {
      csvStream = fs.createWriteStream(CSV_PATH, { flags: "a" });
      if (!fs.existsSync(CSV_PATH) || fs.statSync(CSV_PATH).size === 0) {
        csvStream.write("timestamp,payment_event_id,status,utm_source,utm_medium,has_meta_ad,billing_reason,converting_platform,attribution_confidence,is_renewal,error\n");
      }
    } catch (e) {
      console.error(`⚠️ Failed to open CSV at ${CSV_PATH}: ${e instanceof Error ? e.message : String(e)} — terminal-log only.`);
      csvStream = null;
    }
  }
  function csvWrite(row: Record<string, unknown>): void {
    if (!csvStream) return;
    try {
      csvStream.write([
        new Date().toISOString(), row.id, row.status, row.utmSource, row.utmMedium, row.hasMetaAd,
        row.billingReason, row.convertingPlatform, row.attributionConfidence, row.isRenewal, row.error,
      ].map(csvEscape).join(",") + "\n");
    } catch { /* never break the loop */ }
  }

  console.log("\nBackfill convertingPlatform on historical PaymentEvents");
  console.log("======================================================");
  console.log(`  Mode:       ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`  Filter:     { eventType: "BenefitsGranted", convertingPlatform: null }`);
  console.log(`  Limit:      ${LIMIT === Infinity ? "no limit" : LIMIT}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  CSV log:    ${csvStream ? CSV_PATH : "DISABLED"}\n`);

  const startMs = Date.now();
  let processed = 0, succeeded = 0, errored = 0, aborted = false;
  const platformTally: Record<string, number> = {};
  const sigint = () => { console.log("\n⚠️ SIGINT — finishing current row then exiting..."); aborted = true; };
  process.on("SIGINT", sigint);

  let outerError: unknown = null;
  try {
    const query = PaymentEvent.find(
      { eventType: "BenefitsGranted", convertingPlatform: null },
      { paymentIntentId: 1, data: 1, attributionAdId: 1, attributionAdsetId: 1, attributionCampaignId: 1 }
    );
    if (LIMIT !== Infinity) query.limit(LIMIT);
    const cursor = query.cursor({ batchSize: BATCH_SIZE });
    try {
      for await (const ev of cursor) {
        if (aborted) break;
        processed++;
        const id = String((ev as { _id: unknown })._id);
        try {
          const data = (ev as { data?: Record<string, unknown> }).data ?? {};
          const hasMetaAd = !!(
            (ev as { attributionAdId?: string | null }).attributionAdId ||
            (ev as { attributionAdsetId?: string | null }).attributionAdsetId ||
            (ev as { attributionCampaignId?: string | null }).attributionCampaignId
          );
          const decision = deriveBackfillAttribution({
            utmSource: typeof data.utmSource === "string" ? data.utmSource : undefined,
            utmMedium: typeof data.utmMedium === "string" ? data.utmMedium : undefined,
            billingReason: typeof data.billingReason === "string" ? data.billingReason : undefined,
            hasMetaAdAttribution: hasMetaAd,
          });
          platformTally[decision.convertingPlatform] = (platformTally[decision.convertingPlatform] ?? 0) + 1;

          if (!DRY_RUN) {
            await PaymentEvent.updateOne(
              { _id: (ev as { _id: unknown })._id },
              { $set: {
                convertingPlatform: decision.convertingPlatform,
                attributionConfidence: decision.attributionConfidence,
                isRenewal: decision.isRenewal,
              } }
            );
          }
          csvWrite({
            id, status: "ok",
            utmSource: data.utmSource, utmMedium: data.utmMedium, hasMetaAd, billingReason: data.billingReason,
            convertingPlatform: decision.convertingPlatform, attributionConfidence: decision.attributionConfidence, isRenewal: decision.isRenewal,
          });
          if (DRY_RUN && processed <= 10) {
            console.log(`[dry-run] ${id}: utm_source=${data.utmSource ?? "—"} metaAd=${hasMetaAd} → ${decision.convertingPlatform} (renewal=${decision.isRenewal})`);
          }
          succeeded++;
        } catch (err) {
          errored++;
          const msg = err instanceof Error ? err.message : String(err);
          csvWrite({ id, status: "error", error: msg });
          console.error(`✗ ${id}: ${msg}`);
        }
        if (processed % 1000 === 0) {
          const el = Date.now() - startMs;
          console.log(`Progress: ${processed} rows · ${succeeded} ok · ${errored} err · ${Math.round(processed / Math.max(el / 1000, 1))}/sec · ${formatDuration(el)}`);
        }
      }
    } finally {
      process.removeListener("SIGINT", sigint);
    }
  } catch (err) {
    outerError = err;
    console.error(`\n🚨 Outer-loop error after ${processed} rows: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\nSummary\n=======");
  console.log(`  Mode:      ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  Elapsed:   ${formatDuration(Date.now() - startMs)}`);
  console.log(`  Processed: ${processed}  ·  ok: ${succeeded}  ·  errored: ${errored}`);
  console.log(`  Platform tally: ${JSON.stringify(platformTally)}`);
  if (aborted) console.log("  ⚠️ Aborted via SIGINT — partial run");
  if (outerError) console.log("  🚨 Outer-loop error — partial run");
  if (csvStream) console.log(`  CSV: ${CSV_PATH}  (grep ',error,' to find failures)`);

  if (csvStream) await new Promise<void>((r) => csvStream!.end(() => r()));
  try { const mongoose = (await import("mongoose")).default; await mongoose.disconnect(); } catch { /* ignore */ }

  if (outerError) process.exit(3);
  process.exit(errored > 0 ? 2 : 0);
}

main().catch((err) => { console.error("\n🚨 Backfill aborted with unhandled error:", err); process.exit(1); });
```

- [ ] **Step 2: Verify it compiles & dry-runs.** `npx tsc --noEmit` → PASS. Then `npm run backfill:converting-platform:dry -- --limit=50` against a dev DB → confirm it connects, prints the dry-run samples + platform tally, writes the CSV, exits 0, and writes NOTHING (verify by re-querying that the 50 rows still have `convertingPlatform: null`).

- [ ] **Step 3: Commit** (if authorized): `feat(scripts): add convertingPlatform historical backfill (dry-run + CSV audit + 3-tier exit)`

---

## Task 3: npm scripts

**Files:** `package.json`

- [ ] **Step 1:** Add (next to the other `backfill:*` entries):
```json
"backfill:converting-platform": "tsx scripts/backfill-converting-platform.ts",
"backfill:converting-platform:dry": "tsx scripts/backfill-converting-platform.ts --dry-run",
```
- [ ] **Step 2:** `npm run backfill:converting-platform:dry -- --limit=1` → runs (proves the script + `--` arg passthrough works). **Commit** (if authorized): `chore: add backfill:converting-platform npm scripts`

---

## Task 4: Docs

**Files:** `docs/tracking/backend.md`, `docs/infrastructure/*`, `docs/PAYMENT_ATTRIBUTION.md`

- [ ] **Step 1:** `docs/tracking/backend.md` — document `deriveBackfillAttribution` (precedence + always-`inferred_backfill`).
- [ ] **Step 2:** `docs/infrastructure/` (the file that lists `scripts/backfill-*`) — add `backfill-converting-platform.ts` (purpose, dry-run-first, idempotent `convertingPlatform: null` filter, 3-tier exit, CSV audit).
- [ ] **Step 3:** `docs/PAYMENT_ATTRIBUTION.md` — backfill subsection: forward-fill (Phase 1) + this inferred backfill, and that the dashboard's `byConfidence.inferred_backfill` segments it out.
- [ ] **Step 4:** Run `/doc-sync` → no `BLOCKED`. **Commit** (if authorized): `docs: document convertingPlatform backfill`

---

## Operational runbook (post-merge, not a code task)
1. `npm run backfill:converting-platform:dry` (full, no limit) against production-like data → inspect the CSV + platform tally; sanity-check the `direct` share isn't absurd (would signal missing historical UTM).
2. `npm run backfill:converting-platform` (live). Re-runnable; exit 2 means per-row errors — `grep ',error,'` the CSV and re-run (the filter auto-skips already-done rows).
3. Dashboard: historical revenue now appears per-platform tagged `inferred_backfill`; confirm the confidence split renders it distinctly from live `click`/`utm_only`.

## Out of scope
- Re-deriving from click IDs (none were stored historically — impossible by definition).
- Backfilling the dashboard daily snapshots: after the ledger backfill, either re-run `npm run backfill:dashboard-stats-snapshots` (existing) so completed-day snapshots pick up `attributedRevenue`, or rely on the reader's live recompute for the visible range. Note this in the runbook; the snapshot-rebuild is a separate existing tool, not new code here.

## Self-Review
- **Spec §3.6 coverage:** inferred-backfill derivation (Task 1) ✓; forward-only-safe non-overwrite via `convertingPlatform: null` filter (Task 2) ✓; dry-run default + `:dry` variant + append-mode CSV audit mirroring `c9ea0220` (Task 2/3) ✓; confidence tier always `inferred_backfill` (Task 1) ✓.
- **Placeholders:** none — full script + full helper + full test included. Doc step names the exact files.
- **Type consistency:** `deriveBackfillAttribution` returns `{ convertingPlatform: ConvertingPlatform; attributionConfidence: "inferred_backfill"; isRenewal: boolean }`, consumed verbatim by the script's `$set`. Reuses `normalizeUtmToPlatform`/`classifyIsRenewal` from Phase 1 unchanged.
- **Idempotency** is structural (the `null` filter), not flag-based — re-runs converge, matching the reference script's safety posture.
