/**
 * Backfill: re-classify historical PAST-DUE RE-BILL PaymentEvents as renewals.
 *
 * A re-bill (mintCurrentCycleInvoice, billing_cycle_anchor:'now') stored `data.billingReason:
 * "subscription_update"` before the webhook normalization shipped, so it was mislabeled as a NEW
 * subscription in the admin activity/history AND counted as new-acquisition in revenue/ROAS. This
 * flips those historical events to `data.billingReason: "subscription_cycle"` + `isRenewal: true`
 * (exactly what the fixed webhook now writes), so every display + analytics consumer treats them as
 * renewals.
 *
 * SAFETY: dry-run by DEFAULT (pass --apply to write). Each candidate is POSITIVELY confirmed to be a
 * re-bill via live Stripe — the member's subscription must carry metadata.billing_anchor_rule ===
 * "rebill_current_cycle" and NOT be a pending upgrade — so a genuine tier UPGRADE (also
 * subscription_update) is never touched. Read-only Stripe. Windowed by --since-hours (default 48).
 *
 * Usage:
 *   npx tsx scripts/backfill-rebill-payment-events.ts                 # dry-run, last 48h
 *   npx tsx scripts/backfill-rebill-payment-events.ts --since-hours=24
 *   npx tsx scripts/backfill-rebill-payment-events.ts --apply         # LIVE write
 */
import { config } from "dotenv";
import path from "path";
// Prefer .env.production if present (this backfill targets production data); fall back to .env.local.
config({ path: path.resolve(process.cwd(), ".env.production") });
config({ path: path.resolve(process.cwd(), ".env.local") });
import mongoose from "mongoose";
import Stripe from "stripe";

const APPLY = process.argv.includes("--apply");
const sinceHoursArg = process.argv.find((a) => a.startsWith("--since-hours="));
const SINCE_HOURS = sinceHoursArg ? Number(sinceHoursArg.split("=")[1]) : 48;

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (!uri) throw new Error("MONGODB_URI unset");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY unset (needed to confirm each event is a re-bill)");
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  try { const u = new URL(uri); console.log(`Mongo host=${u.host} db=${u.pathname.replace("/", "") || "(default)"}`); } catch {}
  console.log(`Stripe key mode: ${stripeKey.startsWith("sk_live") ? "LIVE" : stripeKey.startsWith("sk_test") ? "TEST" : "?"}`);
  console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"} · window: last ${SINCE_HOURS}h\n`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db!;
  const pe = db.collection("paymentevents");
  const users = db.collection("users");

  const since = new Date(Date.now() - SINCE_HOURS * 3600 * 1000);
  const candidates = await pe.find({
    eventType: "BenefitsGranted",
    packageType: "membership",
    "data.billingReason": "subscription_update",
    timestamp: { $gte: since },
  }).toArray();
  console.log(`Candidate subscription_update membership events since ${since.toISOString()}: ${candidates.length}\n`);

  let confirmed = 0, skippedNotRebill = 0, skippedNoSub = 0, updated = 0, errors = 0;
  for (const [i, ev] of candidates.entries()) {
    const tag = `[${i + 1}/${candidates.length}] ${ev.packageName} · user=${ev.userId} · ${new Date(ev.timestamp).toISOString()}`;
    try {
      const user = await users.findOne({ _id: ev.userId }, { projection: { stripeSubscriptionId: 1, email: 1 } });
      const subId = user?.stripeSubscriptionId;
      if (!subId) { console.log(`  SKIP (no sub)      ${tag}`); skippedNoSub++; continue; }
      const sub = await stripe.subscriptions.retrieve(subId);
      const anchorRule = sub.metadata?.billing_anchor_rule;
      const hasUpgrade = Boolean(sub.metadata?.upgradeFrom);
      const isRebill = anchorRule === "rebill_current_cycle" && !hasUpgrade;
      if (!isRebill) {
        console.log(`  SKIP (not rebill)  ${tag}  [anchor=${anchorRule ?? "-"} upgradeFrom=${hasUpgrade}]`);
        skippedNotRebill++;
        continue;
      }
      confirmed++;
      if (APPLY) {
        await pe.updateOne({ _id: ev._id }, { $set: { "data.billingReason": "subscription_cycle", isRenewal: true } });
        updated++;
        console.log(`  ✅ UPDATED         ${tag}`);
      } else {
        console.log(`  WOULD UPDATE       ${tag}  → data.billingReason=subscription_cycle, isRenewal=true`);
      }
    } catch (e) {
      errors++;
      console.log(`  ERROR              ${tag}  :: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nSummary: candidates=${candidates.length} confirmed-rebill=${confirmed} updated=${updated} ` +
    `skipped(not-rebill)=${skippedNotRebill} skipped(no-sub)=${skippedNoSub} errors=${errors}`);
  console.log(APPLY ? "APPLIED." : "DRY-RUN complete — re-run with --apply to write.");
  await mongoose.disconnect();
  process.exit(errors > 0 ? 2 : 0);
}
main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
