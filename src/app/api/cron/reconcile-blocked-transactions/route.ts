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
 * Daily safety net for the BlockedTransaction <-> Stripe pairing. Counts
 * yesterday's BlockedTransaction rows in Mongo and yesterday's blocked
 * charges in Stripe (via charges.search) and alerts on >5% drift.
 *
 * Phase D of the Stripe-allowlist work — see
 * docs/billing-stripe/architecture.md and docs/billing-stripe/gotchas.md.
 *
 * Vercel cron — internal-only. Read-only (no DB writes, no mutating Stripe
 * calls), so no `CRON_SECRET` check is enforced — matches `sync-meta-spend-by-url`
 * and `major-draw-transition` siblings. Do not copy this pattern to a cron
 * that mutates state.
 */
export async function GET() {
  const startTime = Date.now();
  try {
    await connectDB();

    // Yesterday in UTC: [yesterdayStart, yesterdayEnd)
    const now = new Date();
    const yesterdayEnd = new Date(now);
    yesterdayEnd.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = new Date(yesterdayEnd);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const fromUnix = Math.floor(yesterdayStart.getTime() / 1000);
    const toUnix = Math.floor(yesterdayEnd.getTime() / 1000);

    // Mongo count
    const BlockedTransaction = (await import("@/models/BlockedTransaction")).default;
    const mongoCount = await BlockedTransaction.countDocuments({
      createdAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
    });

    // Stripe count — search failed charges, filter to outcome.type === "blocked"
    const { stripe } = await import("@/lib/stripe");
    const query = `status:"failed" AND created>${fromUnix} AND created<${toUnix}`;
    let stripeCount = 0;
    for await (const charge of stripe.charges.search({ query, limit: 100 })) {
      if (charge.outcome?.type === "blocked") stripeCount += 1;
    }

    const driftRatio = computeDriftRatio(mongoCount, stripeCount);
    const alerted = driftRatio > DRIFT_THRESHOLD;

    const summary = {
      window: {
        from: yesterdayStart.toISOString(),
        to: yesterdayEnd.toISOString(),
      },
      mongoCount,
      stripeCount,
      driftRatio,
      threshold: DRIFT_THRESHOLD,
      alerted,
      durationMs: Date.now() - startTime,
    };

    if (alerted) {
      console.error(
        "[reconcile-blocked-transactions] DRIFT DETECTED",
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
