import { NextResponse } from "next/server";
import { runRenewalGrantReconciliation } from "@/services/reconciliation/renewalGrantReconciler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reconcile-renewal-grants
 *
 * Detector for the failure mode that cost eleven members $300.00 of entries on
 * 2026-08-23: a renewal Stripe was PAID for whose entry grant never landed.
 * Read-only — it writes nothing to Mongo and calls Stripe not at all. Healing is
 * a deliberate human step (`scripts/backfill-missing-renewal-grants.ts`), because
 * a grant carries a draw-routing timestamp that a blind auto-heal would get wrong.
 *
 * Also reports `stripewebhookqueue` rows in `dead`. Until 2026-08-24 a handler
 * that failed silently was ACKed as a success, so `dead` was barely reachable;
 * the ack gate in `processQueuedEvent` made it reachable for six previously-silent
 * failure paths, four of which cannot self-heal. A dead row with no alert is the
 * same blind spot in a new place.
 *
 * AUTH — fails CLOSED. Most sibling crons do `if (!cronSecret) return true`, which
 * leaves the endpoint open whenever the env var is missing. This one refuses
 * instead, matching `/api/cron/charge-past-due`.
 *
 * SCHEDULE — `40 3 * * *`. Deliberately NOT 14:00 or 15:00 UTC: those are the
 * anchor-24 renewal burst (14:00 UTC = 00:00 AEST) and its payment wave. By
 * 03:40 UTC the previous day's renewals are ~13h settled, well past the webhook
 * queue's 7h21m retry ladder.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  try {
    const result = await runRenewalGrantReconciliation();
    const durationMs = Date.now() - startTime;

    // console.error, NOT console.log — production builds strip log/info/debug/warn
    // (next.config.ts `compiler.removeConsole`), so a findings line logged any
    // other way is invisible in Vercel. One line each, greppable by prefix.
    if (result.ungrantedCount > 0) {
      console.error(
        `[reconcile-renewal-grants] PAID BUT NOT GRANTED: ${result.ungrantedCount} renewal(s), ${result.ungrantedCents} cents, window ${result.since}..${result.until} — ${JSON.stringify(
          result.ungranted.map((r) => ({
            invoice: r.stripeInvoiceId,
            userId: r.userId,
            cents: r.amountPaidCents,
            chargedAt: r.chargedAt.toISOString(),
          }))
        )}`
      );
    }

    if (result.deadCount > 0) {
      console.error(
        `[reconcile-renewal-grants] DEAD WEBHOOK ROWS: ${result.deadCount} — ${JSON.stringify(
          result.dead.map((d) => ({
            eventId: d.eventId,
            type: d.type,
            attempts: d.attempts,
            lastError: d.lastError,
            diedAt: d.diedAt ? d.diedAt.toISOString() : null,
          }))
        )}`
      );
    }

    if (result.ungrantedCount === 0 && result.deadCount === 0) {
      // Heartbeat, deliberately at `error` level. A clean run logged via
      // console.log is STRIPPED in production, which makes "ran and found
      // nothing" indistinguishable from "never fired" — and a safety net that
      // cannot prove it ran is not much of a net. One short line a day.
      console.error(
        `[reconcile-renewal-grants] OK: 0 ungranted, 0 dead, window ${result.since}..${result.until}, ${durationMs}ms`
      );
    }

    return NextResponse.json({ success: true, ...result, durationMs });
  } catch (e) {
    console.error("[reconcile-renewal-grants] failure:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
