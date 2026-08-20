/**
 * Retire abandoned pending shop orders.
 *
 *   npx tsx scripts/cleanup-abandoned-shop-orders.ts --dry-run
 *   npx tsx scripts/cleanup-abandoned-shop-orders.ts            [--limit=N] [--csv-path=PATH] [--no-csv]
 *
 * WHY THIS EXISTS
 *
 * Two now-fixed bugs left permanently-`pending` orders in the collection:
 *
 *   1. Every POST to /api/shop/checkout minted a NEW order and a NEW PaymentIntent,
 *      so a refresh at the card step duplicated the order. Fixed by
 *      ShopOrderService.resolvePendingOrder (reuse-or-create).
 *   2. The payment_failed webhook assigned `status = "failed"`, which is not in the
 *      Order enum, so Mongoose rejected the save and every declined card left its
 *      order pending forever. Fixed to write `cancelled` with a notes reason.
 *
 * Both fixes are forward-only. The rows already written are still counted by admin
 * order counts, per-user spend figures and the Norm projections, which is the dirty
 * data this clears.
 *
 * SAFETY — the rule that matters
 *
 * A pending order is only retired once STRIPE says its payment cannot succeed. The
 * PaymentIntent is retrieved FIRST, and anything `succeeded` or `processing` is left
 * completely alone and written to the CSV as needing reconciliation — that is a paid
 * order whose webhook never landed, and deleting or cancelling it would destroy the
 * only record of money we owe goods for. An order with no paymentIntentId at all never
 * reached Stripe and is safe to retire on age.
 *
 * Retire means `status: "cancelled"` with a `notes` reason, NOT deletion: the audit
 * trail survives, and every counting surface already excludes cancelled.
 */
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import Stripe from "stripe";
import Order from "@/models/Order";
import { PENDING_GRACE_MS } from "@/services/shop/orderQueries";

const DRY_RUN = process.argv.includes("--dry-run");
const NO_CSV = process.argv.includes("--no-csv");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : Infinity;
const CSV_PATH_ARG = process.argv.find((a) => a.startsWith("--csv-path="));
const CSV_PATH = CSV_PATH_ARG
  ? CSV_PATH_ARG.split("=")[1]
  : path.resolve(
      process.cwd(),
      `cleanup-abandoned-shop-orders-${DRY_RUN ? "dry-" : ""}${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.csv`
    );

/** Stripe states that mean the intent can never be paid — safe to retire the order. */
const DEAD_INTENT_STATUSES = new Set([
  "canceled",
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

/** Stripe states that mean money may already have moved. NEVER touch these. */
const LIVE_INTENT_STATUSES = new Set(["succeeded", "processing"]);

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(2);
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("STRIPE_SECRET_KEY is not set — refusing to guess at payment state.");
    process.exit(2);
  }
  const stripe = new Stripe(stripeKey);

  let csvStream: fs.WriteStream | null = null;
  if (!NO_CSV) {
    try {
      // Existence is checked BEFORE opening the stream. createWriteStream is LAZY — it
      // does not touch the filesystem until the first write — so statSync on a brand-new
      // path throws ENOENT, the catch below fires, and the audit log silently disabled
      // itself on every run. Found by running it, not by reading it.
      const isNew = !fs.existsSync(CSV_PATH) || fs.statSync(CSV_PATH).size === 0;
      csvStream = fs.createWriteStream(CSV_PATH, { flags: "a" });
      if (isNew) {
        csvStream.write(
          "timestamp,order_number,order_id,created_at,total_amount,payment_intent_id,intent_status,action,error\n"
        );
      }
    } catch (err) {
      console.error(`Could not open CSV at ${CSV_PATH} — continuing without it.`, err);
      csvStream = null;
    }
  }
  const csvWrite = (row: Record<string, unknown>) => {
    if (!csvStream) return;
    csvStream.write(
      [
        new Date().toISOString(),
        row.orderNumber,
        row.orderId,
        row.createdAt,
        row.totalAmount,
        row.paymentIntentId,
        row.intentStatus,
        row.action,
        row.error,
      ]
        .map(csvEscape)
        .join(",") + "\n"
    );
  };

  await mongoose.connect(uri);

  const cutoff = new Date(Date.now() - PENDING_GRACE_MS);
  const filter = { status: "pending" as const, createdAt: { $lt: cutoff } };

  // Up-front denominator, so progress means something.
  const total = Math.min(await Order.countDocuments(filter), LIMIT);

  console.log("Cleanup: abandoned pending shop orders");
  console.log(`  Database:   ${mongoose.connection.name}`);
  console.log(`  Mode:       ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`  Older than: ${cutoff.toISOString()} (PENDING_GRACE_MS)`);
  console.log(`  Candidates: ${total}`);
  console.log(`  CSV log:    ${csvStream ? CSV_PATH : "DISABLED"}`);
  console.log("");

  if (total === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    csvStream?.end();
    process.exit(0);
  }

  const counts = { retired: 0, keptLive: 0, keptUnknown: 0, noIntent: 0, errors: 0 };
  const startedAt = Date.now();
  // ~20 progress lines regardless of size, so even a small run visibly moves.
  const step = Math.max(1, Math.floor(total / 20));
  let processed = 0;

  const cursor = Order.find(filter).sort({ createdAt: 1 }).cursor();

  for await (const order of cursor) {
    if (processed >= LIMIT) break;
    processed += 1;

    const base = {
      orderNumber: order.orderNumber,
      orderId: String(order._id),
      createdAt: order.createdAt?.toISOString?.() ?? "",
      totalAmount: order.totalAmount,
      paymentIntentId: order.paymentIntentId ?? "",
    };

    try {
      let intentStatus = "";
      let retire = false;
      let reason = "";

      if (!order.paymentIntentId) {
        // Never reached Stripe — an order created before the intent call failed.
        intentStatus = "none";
        retire = true;
        reason = "Abandoned checkout — no payment attempted";
        counts.noIntent += 1;
      } else {
        const intent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
        intentStatus = intent.status;

        if (LIVE_INTENT_STATUSES.has(intent.status)) {
          // PAID OR PAYING. Leave it. This is a webhook that never landed, and it needs
          // a human, not a status change.
          counts.keptLive += 1;
          csvWrite({ ...base, intentStatus, action: "KEPT — needs reconciliation", error: "" });
          continue;
        }
        if (!DEAD_INTENT_STATUSES.has(intent.status)) {
          // An unrecognised state: be conservative and report it rather than guess.
          counts.keptUnknown += 1;
          csvWrite({ ...base, intentStatus, action: "KEPT — unknown intent status", error: "" });
          continue;
        }
        retire = true;
        reason = `Abandoned checkout — payment ${intent.status}`;
      }

      if (retire) {
        if (!DRY_RUN) {
          // `status: "pending"` in the filter is the race guard — the same one markPaid
          // uses — so a webhook landing mid-sweep always wins.
          await Order.updateOne(
            { _id: order._id, status: "pending" },
            { status: "cancelled", notes: reason }
          );
        }
        counts.retired += 1;
        csvWrite({ ...base, intentStatus, action: DRY_RUN ? "WOULD RETIRE" : "RETIRED", error: "" });
      }
    } catch (err) {
      counts.errors += 1;
      csvWrite({ ...base, intentStatus: "", action: "ERROR", error: (err as Error).message });
      console.error(`  ! ${order.orderNumber}: ${(err as Error).message}`);
    }

    if (processed % step === 0 || processed === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = processed / Math.max(elapsed, 0.001);
      const remaining = Math.max(total - processed, 0);
      const eta = rate > 0 ? Math.round(remaining / rate) : 0;
      console.log(
        `  ${processed}/${total} (${Math.round((processed / total) * 100)}%) · ` +
          `${rate.toFixed(1)}/sec · ETA ${eta}s · retired ${counts.retired}, kept ${counts.keptLive + counts.keptUnknown}`
      );
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`  Processed:                ${processed}`);
  console.log(`  ${DRY_RUN ? "Would retire" : "Retired"}:${DRY_RUN ? "             " : "                  "}${counts.retired}`);
  console.log(`    of which no intent:     ${counts.noIntent}`);
  console.log(`  KEPT — needs reconciling: ${counts.keptLive}   <- paid or paying, webhook never landed`);
  console.log(`  KEPT — unknown status:    ${counts.keptUnknown}`);
  console.log(`  Errors:                   ${counts.errors}`);
  if (csvStream) console.log(`  CSV:                      ${CSV_PATH}`);
  if (counts.keptLive > 0) {
    console.log("");
    console.log(`  ⚠  ${counts.keptLive} order(s) have a succeeded/processing PaymentIntent but are still`);
    console.log("     pending. Those are PAID orders whose webhook was lost — reconcile them by hand.");
  }

  await mongoose.disconnect();
  csvStream?.end();

  // 3-tier exit: 0 clean, 1 completed with errors, 2 could not run.
  process.exit(counts.errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* already closed */
  }
  process.exit(2);
});
