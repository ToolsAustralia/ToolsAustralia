import { NextResponse } from "next/server";
import {
  runKlaviyoProfileReconciliation,
  BACKLOG_ALERT_THRESHOLD,
} from "@/services/klaviyo/KlaviyoProfileReconciliationService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reconcile-klaviyo-profiles
 *
 * Re-syncs every user whose `updatedAt` moved since the stored watermark. This is the ONLY
 * mechanism that guarantees a Klaviyo profile catches up after a purchase — the ~24
 * `ensureUserProfileSynced` call sites are fire-and-forget (the function returns `void`) and
 * cannot be relied on for correctness.
 *
 * `?mode=full` walks a SEPARATE rotating cursor (`KlaviyoSyncState.fullPassCursor`) that
 * advances every run and wraps when a circuit completes. It refreshes purely time-derived
 * properties (`membership_active_duration_months`) that change with the calendar and
 * therefore dirty no document, so the incremental watermark can never see them.
 *
 * It runs HOURLY, not weekly. A run covers ~344 users (the time budget), so at 24 runs/day a
 * full circuit takes ~7 days at 56k profiles and ~27 days at 4x that — comfortably inside the
 * monthly tick of the property it exists to refresh. A weekly schedule would have taken 164
 * weeks. Cost: ~16.5k Klaviyo calls/day, ~1.6% of the steady budget.
 *
 * AUTH — fails CLOSED. Most sibling crons do `if (!cronSecret) return true`, which leaves the
 * endpoint open whenever the env var is missing. This one refuses instead, matching
 * `/api/cron/reconcile-renewal-grants` and `/api/cron/charge-past-due`.
 *
 * SCHEDULE — every 5 minutes, plus a weekly full pass. Klaviyo's own integration guidance is
 * "at least every 30 minutes (e.g. on a cron)", and the binding rule is that sync frequency
 * must fall inside the shortest flow time delay. Production mutates ~6 users per 5 minutes,
 * so a run costs ~12 Klaviyo API calls against a ~700/min steady budget and one indexed
 * `updatedAt` seek.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = new URL(request.url).searchParams.get("mode") === "full" ? "full" : "incremental";

  try {
    const result = await runKlaviyoProfileReconciliation({ mode });

    // console.error, NOT console.log — production builds strip log/info/debug/warn
    // (next.config.ts `compiler.removeConsole`), so a findings line logged any other way is
    // invisible in Vercel. One line each, greppable by prefix.
    // Retryable — the watermark held, so these users are covered again next run.
    if (result.retryableFailures > 0) {
      console.error(
        `[reconcile-klaviyo-profiles] ${result.retryableFailures} RETRYABLE failure(s) of ` +
          `${result.candidates} candidate(s); watermark HELD at ${result.watermarkAfter} — ` +
          `next run re-covers this window`
      );
    }

    // Permanent — the cursor stepped PAST these so one bad profile cannot pin the sweep.
    // They must be named here: they are absent from the backlog count (the cursor moved on)
    // and carry no `klaviyoSyncedAt`, so this line is the only thing pointing at them.
    if (result.permanentFailures > 0) {
      console.error(
        `[reconcile-klaviyo-profiles] ${result.permanentFailures} PERMANENT failure(s) stepped ` +
          `over (a hard 4xx never succeeds on retry — fix the data). Affected: ` +
          JSON.stringify(result.permanentlyFailedSample)
      );
    }

    // Expected while a backfill drains; on an INCREMENTAL run it means ~6-users-per-5-minutes
    // is no longer the shape of production and the cadence or throttle needs revisiting.
    if (result.timeBudgetExhausted && result.mode === "incremental") {
      console.error(
        `[reconcile-klaviyo-profiles] TIME BUDGET EXHAUSTED on an incremental run after ` +
          `${result.processed}/${result.candidates} user(s) — the sweep can no longer clear a ` +
          `cycle within its budget`
      );
    }

    // INCREMENTAL ONLY — same guard as the time-budget alert above, and for the same reason.
    // `backlogCount` counts users past `watermarkAfter`, which on an incremental run means
    // "not yet synced" (a real alert). On a scheduled FULL pass `watermarkBefore` is the
    // rotating `fullPassCursor`, which WRAPS TO EPOCH when a circuit completes — so its
    // backlog is "population this circuit has not walked to yet", which is the design, not a
    // fault. Ungated, the hourly full pass logged this at error level for most of every
    // circuit: 394 alerts in the 7 days to 2026-09-03, decaying 29471 → 22966 → 16931 → 7916
    // exactly as a circuit advances, while the incremental sweep sat 5 minutes behind with a
    // backlog of 5. Alerts nobody can act on bury the ones they can.
    if (result.backlogCount > BACKLOG_ALERT_THRESHOLD && result.mode === "incremental") {
      console.error(
        `[reconcile-klaviyo-profiles] BACKLOG: ${result.backlogCount} user(s) still awaiting ` +
          `sync after this run (threshold ${BACKLOG_ALERT_THRESHOLD}) — the sweep is falling behind`
      );
    }

    if (result.entryLedgerDivergentCount > 0) {
      console.error(
        `[reconcile-klaviyo-profiles] ENTRY LEDGER DIVERGENCE: ${result.entryLedgerDivergentCount} ` +
          `of ${result.candidates} user(s) hold fewer accumulatedEntries than their paid grants ` +
          `total — see the entry-accounting ticket, not this sweep`
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[reconcile-klaviyo-profiles] run failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
