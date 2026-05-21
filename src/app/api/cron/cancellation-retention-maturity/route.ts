import { NextRequest, NextResponse } from "next/server";

// Heavy server-side imports (mongodb, User, CancellationFlowEvent) are deferred
// to the GET handler body via dynamic import() so this module is safely
// importable in test environments that lack MONGODB_URI. Only the pure helpers
// (maturedFilter / isRetained) are imported by tests — they have no server deps.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported so they can be unit-tested without a DB
// ---------------------------------------------------------------------------

/** 90 days in milliseconds — the maturity window for a saved cancellation. */
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Mongo filter selecting saved cancellation-flow events that are ≥90 days old
 * and have not yet been matured (retention90 still null).
 *
 * The `savedAt <= now - 90d` upper bound makes the query bounded (date-windowed)
 * and exactly matches the `matured` cutoff used by the analytics shaper
 * (`summarizeCancellationEvents`: `savedAt <= now - NINETY_DAYS_MS`), so the
 * admin panel's retention90 split reflects this cron's output the moment it
 * writes "retained"/"churned".
 *
 * `retention90: null` in the filter is what makes the whole job idempotent:
 * once an event is matured the cron will never re-select it, and a concurrent
 * run's `updateOne({ _id, retention90: null }, …)` is a no-op once set.
 */
export function maturedFilter(now: Date): {
  outcome: "saved";
  savedAt: { $lte: Date };
  retention90: null;
} {
  return {
    outcome: "saved",
    savedAt: { $lte: new Date(now.getTime() - NINETY_DAYS_MS) },
    retention90: null,
  };
}

/**
 * Minimal user shape needed to decide retention. Mirrors the canonical
 * "active recurring subscriber" predicate `getActiveSubscriptionFilter`
 * (`src/utils/admin/userFilterBuilder.ts:42`) field-for-field.
 */
export interface RetentionUserShape {
  isActive?: boolean;
  subscription?: {
    isActive?: boolean;
    autoRenew?: boolean;
    status?: string;
  } | null;
}

/**
 * Stripe subscription statuses that count as a current paying/entitled
 * membership — kept in lockstep with `ACTIVE_SUBSCRIPTION_STATUSES` in
 * `src/utils/admin/userFilterBuilder.ts` (the canonical admin definition).
 */
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

/**
 * Returns true iff the user currently has an ACTIVE RECURRING subscription,
 * mirroring the canonical Mongo predicate `getActiveSubscriptionFilter`
 * (`src/utils/admin/userFilterBuilder.ts:42`) exactly:
 *
 *   - user account active                 → `isActive === true`
 *   - subscription marked active          → `subscription.isActive === true`
 *   - will auto-renew (recurring)         → `subscription.autoRenew !== false`
 *                                            (true OR undefined; default is true)
 *   - Stripe status is active/trialing    → `subscription.status ∈ {active,trialing}`
 *
 * A missing / null user (deleted account) has no active subscription → false
 * (the cron treats that as "churned"; see route docstring for rationale).
 */
export function isRetained(user: RetentionUserShape | null | undefined): boolean {
  if (!user) return false;
  if (user.isActive !== true) return false;

  const sub = user.subscription;
  if (!sub) return false;
  if (sub.isActive !== true) return false;
  // autoRenew: only NOT recurring when explicitly false (mirrors `$ne: false`).
  if (sub.autoRenew === false) return false;
  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status as "active" | "trialing")) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Cron GET handler
// ---------------------------------------------------------------------------

/**
 * Generous safety cap. The `savedAt <= now - 90d` window already bounds the
 * query to a fixed historical slice; this only guards against a one-off
 * pathological backlog (e.g. the cron failing for months). 5000 matured rows
 * per daily run is far more than realistic saved-event volume.
 */
const MAX_EVENTS_PER_RUN = 5000;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Deferred imports — only reached at runtime, never in unit tests.
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: User } = await import("@/models/User");
    const { default: CancellationFlowEvent } = await import(
      "@/models/CancellationFlowEvent"
    );

    await connectDB();

    const now = new Date();
    const events = await CancellationFlowEvent.find(maturedFilter(now))
      .limit(MAX_EVENTS_PER_RUN)
      .lean();

    let processed = 0;
    let retained = 0;
    let churned = 0;
    const errors: string[] = [];

    for (const ev of events) {
      processed += 1;

      try {
        // Read-only on user/subscription. NEVER mutates the subscription or
        // calls Stripe — the only write this cron performs is the retention90
        // field set below.
        const user = (await User.findById(ev.userId, {
          isActive: 1,
          "subscription.isActive": 1,
          "subscription.autoRenew": 1,
          "subscription.status": 1,
        }).lean()) as RetentionUserShape | null;

        // Missing user (deleted account) → treated as churned: a deleted user
        // has no active recurring subscription, so the save did not durably
        // retain a paying member. This is consistent with isRetained(null)
        // and the canonical predicate (no subscription doc → not active).
        const stillRetained = isRetained(user);

        // The `retention90: null` in the FILTER guarantees idempotency: a
        // re-run (or a concurrent run) only writes when still unset, so once
        // matured the value is immutable and re-runs are no-ops.
        await CancellationFlowEvent.updateOne(
          { _id: ev._id, retention90: null },
          { $set: { retention90: stillRetained ? "retained" : "churned" } }
        );

        if (stillRetained) {
          retained += 1;
        } else {
          churned += 1;
        }
      } catch (err) {
        // Per-event errors are isolated: one bad event must not block others.
        const msg = `eventId=${String(ev._id)} userId=${String(ev.userId)}: ${
          err instanceof Error ? err.message : String(err)
        }`;
        console.error(
          "[cron cancellation-retention-maturity] error processing event",
          msg
        );
        errors.push(msg);
      }
    }

    console.error("[cron cancellation-retention-maturity] done", {
      processed,
      retained,
      churned,
      errorCount: errors.length,
    });
    return NextResponse.json({ processed, retained, churned, errors });
  } catch (err) {
    console.error("[cron cancellation-retention-maturity] fatal error:", err);
    return NextResponse.json(
      {
        processed: 0,
        retained: 0,
        churned: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      },
      { status: 500 }
    );
  }
}
