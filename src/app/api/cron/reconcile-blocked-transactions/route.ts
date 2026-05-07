import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DRIFT_THRESHOLD = 0.05; // 5%

/**
 * Computes the drift ratio between two counts.
 * - Both 0 → 0 (no drift, no data)
 * - Stripe 0 with Mongo > 0 → 1 (100% drift, signal we're capturing rows that aren't on Stripe)
 * - Otherwise: |mongo - stripe| / stripe
 *
 * Note: the ratio is intentionally **uncapped** — `(5, 1)` returns `4.0` (400%
 * drift). Capping would lose signal; the alert payload exposes both raw counts
 * so consumers can interpret outliers without inferring proportions from the
 * ratio alone.
 *
 * Exported for unit testing.
 */
export function computeDriftRatio(mongoCount: number, stripeCount: number): number {
  if (stripeCount === 0 && mongoCount === 0) return 0;
  if (stripeCount === 0) return 1;
  return Math.abs(mongoCount - stripeCount) / stripeCount;
}

/**
 * GET /api/cron/reconcile-blocked-transactions
 *
 * Daily safety net for the BlockedTransaction <-> Stripe pairing.
 *
 * Phase D' (this revision): also SELF-HEALS — any blocked charge in the
 * window whose PI is missing in Mongo is upserted using the same projector
 * as the live webhook (`buildBlockedTransactionRecord`). Drift is still
 * logged so we know the live path missed an event; the cron just patches
 * the gap so the admin page is correct by the next morning.
 *
 * Window widened to 48h to cover late-arriving events + DST edge cases.
 *
 * Vercel cron — internal-only. Now WRITES to Mongo (BlockedTransaction
 * upserts) but never mutates Stripe. No `CRON_SECRET` check — same posture
 * as siblings; protected by Vercel's cron-only invocation.
 */
export async function GET() {
  const startTime = Date.now();
  try {
    await connectDB();

    // Last 48h in UTC: [windowStart, windowEnd)
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setUTCHours(0, 0, 0, 0);
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - 2);

    const fromUnix = Math.floor(windowStart.getTime() / 1000);
    const toUnix = Math.floor(windowEnd.getTime() / 1000);

    const BlockedTransaction = (await import("@/models/BlockedTransaction")).default;
    const { stripe } = await import("@/lib/stripe");
    const { buildBlockedTransactionRecord, upsertBlockedTransaction } = await import(
      "@/services/allowlist/blockedTransactionRepo"
    );

    // Phase 1 — count Mongo rows for the window.
    const mongoCount = await BlockedTransaction.countDocuments({
      createdAt: { $gte: windowStart, $lt: windowEnd },
    });

    // Phase 2 — iterate Stripe blocked charges, expanding payment_intent so
    // we can build records without an extra call per charge.
    const query = `status:"failed" AND created>${fromUnix} AND created<${toUnix}`;
    let stripeCount = 0;
    let recovered = 0;
    let recoverErrors = 0;
    const stripeBlocked: Array<{
      pi: import("stripe").default.PaymentIntent;
      charge: import("stripe").default.Charge;
    }> = [];

    for await (const charge of stripe.charges.search({
      query,
      limit: 100,
      expand: ["data.payment_intent"],
    })) {
      if (charge.outcome?.type !== "blocked") continue;
      stripeCount += 1;
      const piRef = charge.payment_intent;
      const pi = piRef && typeof piRef !== "string" ? piRef : null;
      if (pi) stripeBlocked.push({ pi, charge });
    }

    // Phase 3 — find which PIs are missing in Mongo and upsert them.
    if (stripeBlocked.length > 0) {
      const piIds = stripeBlocked.map(({ pi }) => pi.id);
      const presentDocs = await BlockedTransaction.find({ _id: { $in: piIds } })
        .select("_id")
        .lean<Array<{ _id: string }>>();
      const presentSet = new Set(presentDocs.map((d) => d._id));

      for (const { pi, charge } of stripeBlocked) {
        if (presentSet.has(pi.id)) continue;
        try {
          const record = buildBlockedTransactionRecord(pi, charge);
          if (record) {
            await upsertBlockedTransaction(record);
            recovered += 1;
          }
        } catch (err) {
          recoverErrors += 1;
          console.error(
            `[reconcile-blocked-transactions] recover upsert failed for PI ${pi.id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    const driftRatio = computeDriftRatio(mongoCount, stripeCount);
    const alerted = driftRatio > DRIFT_THRESHOLD || recovered > 0;

    const summary = {
      window: {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      },
      mongoCount,
      stripeCount,
      driftRatio,
      threshold: DRIFT_THRESHOLD,
      recovered,
      recoverErrors,
      alerted,
      durationMs: Date.now() - startTime,
    };

    if (alerted) {
      console.error(
        "[reconcile-blocked-transactions] DRIFT/RECOVERY",
        JSON.stringify(summary)
      );
    } else {
      console.log("[reconcile-blocked-transactions] OK", summary);
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    console.error("[reconcile-blocked-transactions] failure:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
