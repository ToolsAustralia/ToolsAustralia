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
