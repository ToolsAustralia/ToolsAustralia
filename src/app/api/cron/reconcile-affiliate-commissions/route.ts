/**
 * Affiliate commission reconciliation cron — the durable safety net.
 *
 * The webhook commission dispatch is fire-and-forget (a commission error must
 * never fail a payment), so a transient failure can silently drop a commission.
 * This daily job re-derives the commission ledger from the durable PaymentEvent
 * source of truth over a trailing window and idempotently **backfills any missing
 * (genuinely-owed) commissions** — self-healing, no manual step. Same pattern as
 * reconcile-major-draw-entries / reconcile-blocked-transactions.
 *
 * Scope: a 35-day trailing window (work is O(recent), not O(all-time)). A full
 * sweep is available on demand via `npm run reconcile:affiliate-commissions`.
 *
 * Safety: only creates OWED commissions (idempotent recordAffiliateCommission).
 * Over-paid commissions (active on a refunded payment) are **flagged via
 * console.error** for manual review — clawback handling is a separate, deferred
 * workstream (see docs/affiliate/gotchas.md "Refund clawback").
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { reconcileAffiliateCommissions } from "@/utils/affiliate/reconcile-commissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Trailing window to reconcile each run — comfortably wider than the gap between a dropped commission and this job. */
const RECONCILE_WINDOW_DAYS = 35;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // local dev / unset → allow (matches sibling crons)
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  try {
    await connectDB();
    const since = new Date(Date.now() - RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const result = await reconcileAffiliateCommissions({ since, apply: true });

    // Surface over-paid (refunded-but-still-active) commissions so ops can review.
    // console.error survives the prod console-strip; clawback is handled manually
    // until the deferred refund-clawback workstream lands.
    if (result.overPaid.length > 0) {
      console.error("⚠️ Affiliate reconcile: commissions active on a refunded payment (manual clawback review):", {
        count: result.overPaid.length,
        ids: result.overPaid.slice(0, 50).map((c) => c.commissionId),
      });
    }

    const summary = {
      success: true,
      windowDays: RECONCILE_WINDOW_DAYS,
      eligibleBenefits: result.eligibleBenefits,
      referredBenefits: result.referredBenefits,
      missingFound: result.missing.length,
      created: result.created,
      overPaidFlagged: result.overPaid.length,
      durationMs: Date.now() - startTime,
    };
    console.log("✅ Affiliate reconcile cron:", summary);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Affiliate reconcile cron failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Manual trigger (also gated).
export async function POST(request: NextRequest) {
  return GET(request);
}
