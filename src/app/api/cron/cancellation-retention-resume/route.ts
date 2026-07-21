import { NextRequest, NextResponse } from "next/server";
import { decidePauseTransition } from "@/services/subscription/pauseCollectionPolicy";

// Heavy server-side imports (stripe, mongodb, User) are deferred to the GET
// handler body via dynamic import() so this module is safely importable in
// test environments that lack STRIPE_SECRET_KEY / MONGODB_URI. Only the
// shouldClearRetentionMarker pure helper is imported by tests — it has no
// server dependencies.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

// ---------------------------------------------------------------------------
// Pure helper — exported so it can be unit-tested without Stripe or DB
// ---------------------------------------------------------------------------

export interface ShouldClearRetentionMarkerInput {
  pauseReason: string | undefined;
  pauseResumesAtIso: string | undefined;
  pauseCollectionPresent: boolean;
  now: Date;
}

/**
 * Returns true when the retention pause metadata should be cleared.
 *
 * Rules:
 * 1. `pauseReason` must equal `"retention"` — otherwise it is not a retention
 *    pause and we have nothing to clear.
 * 2. Clearing is appropriate when EITHER:
 *    a. Stripe already auto-resumed (pause_collection is null / not present)
 *       regardless of the timestamp — the pause is over, metadata is stale.
 *    b. `pauseResumesAt` parses to a valid date that is on or before `now`
 *       (window elapsed) — clear proactively so that a future recovery pause
 *       on the same sub is not mistaken for a retention pause by decideClearPause.
 *
 * An unparseable `pauseResumesAtIso` is treated as NOT elapsed (safer default:
 * do nothing rather than accidentally clear a marker mid-window). In practice
 * this should never happen because RetentionPauseService writes a valid ISO string.
 *
 * Re-running after the marker is already absent (pauseReason !== "retention")
 * is a no-op — the function returns false and the cron skips the subscription.
 */
export function shouldClearRetentionMarker({
  pauseReason,
  pauseResumesAtIso,
  pauseCollectionPresent,
  now,
}: ShouldClearRetentionMarkerInput): boolean {
  if (pauseReason !== "retention") return false;

  // Stripe already auto-resumed — pause_collection is gone but our metadata
  // marker is still present. Always clear in this case (stale marker).
  if (!pauseCollectionPresent) return true;

  // pause_collection is still active; check whether the window has elapsed.
  if (!pauseResumesAtIso) return false;
  const resumesAt = new Date(pauseResumesAtIso);
  if (isNaN(resumesAt.getTime())) {
    // Unparseable date: treat as NOT elapsed (conservative; see docstring above).
    return false;
  }
  return resumesAt <= now;
}

// ---------------------------------------------------------------------------
// Cron GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Deferred imports — only reached at runtime, never in unit tests.
    const { default: connectDB } = await import("@/lib/mongodb");
    const { stripe } = await import("@/lib/stripe");
    const { default: User } = await import("@/models/User");
    const { resumeAfterSuccessfulRenewalPayment } = await import(
      "@/services/subscription/SubscriptionCollectionPauseService"
    );

    await connectDB();

    /**
     * Candidate query: users who have consumed the pause30d retention offer AND
     * have a Stripe subscription ID.
     *
     * Bound: the number of users with `retentionOffersConsumed.pause30d === true`
     * is bounded by site membership count — a few thousand at most. A full scan
     * of this indexed field is acceptable. If this ever grows to 100k+ users, add
     * a `retentionPausedAt` timestamp to the User schema and filter by
     * `retentionPausedAt < (now - 30 days)` to skip users who are still mid-window
     * without a Stripe round-trip. For now, the Stripe retrieve handles gating.
     */
    const candidates = await User.find(
      {
        "retentionOffersConsumed.pause30d": true,
        stripeSubscriptionId: { $exists: true, $ne: null },
      },
      {
        _id: 1,
        stripeSubscriptionId: 1,
        "subscription.status": 1,
        "subscription.pausedFrom": 1,
        "subscription.pausedUntil": 1,
      }
    ).lean();

    const now = new Date();
    let processed = 0;
    let cleared = 0;
    let flipped = 0;
    let restored = 0;
    const errors: string[] = [];

    for (const user of candidates) {
      const subId = user.stripeSubscriptionId as string;
      processed += 1;

      try {
        const subscription = await stripe.subscriptions.retrieve(subId);

        const pauseReason = subscription.metadata?.pauseReason;
        const pauseResumesAtIso = subscription.metadata?.pauseResumesAt;
        const pauseCollectionPresent = subscription.pause_collection != null;

        // BACKSTOP for the DB "paused" membership state — the webhook (handleSubscriptionUpdated /
        // handleInvoicePaymentSucceeded) is the PRIMARY driver; this catches missed events. Uses the
        // SAME pure decision as the webhook (decidePauseTransition) so the two can't drift. Idempotent.
        const pauseSub = user.subscription as
          | { status?: string; pausedFrom?: Date; pausedUntil?: Date }
          | undefined;
        const transition = decidePauseTransition({
          pauseCollectionPresent,
          pauseReason,
          dbStatus: pauseSub?.status,
          pausedFrom: pauseSub?.pausedFrom,
          pausedUntil: pauseSub?.pausedUntil,
          now,
        });
        // (a) FLIP active→paused: freeze window started + retention pause live, webhook flip missed.
        if (transition === "flip_to_paused") {
          await User.updateOne(
            { _id: user._id },
            { $set: { "subscription.status": "paused", "subscription.isActive": false } }
          );
          flipped += 1;
        }
        // (b) RESTORE from paused: DB still says paused but Stripe already resumed (pause_collection
        //     gone). Mirror Stripe's status (active→active; a failed resume shows past_due/unpaid) and
        //     clear the window. The primary restore is invoice.payment_succeeded.
        else if (transition === "restore_from_paused") {
          const backToActive = subscription.status === "active" || subscription.status === "trialing";
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                "subscription.status": backToActive ? "active" : subscription.status,
                "subscription.isActive": backToActive,
              },
              $unset: { "subscription.pausedFrom": "", "subscription.pausedUntil": "" },
            }
          );
          restored += 1;
        }

        if (
          !shouldClearRetentionMarker({
            pauseReason,
            pauseResumesAtIso,
            pauseCollectionPresent,
            now,
          })
        ) {
          // Either not a retention pause, or the window has not elapsed yet.
          // Re-runs are no-ops for already-cleared subs.
          continue;
        }

        // Defensive: if Stripe hasn't auto-resumed yet (pause_collection still
        // present) but our window has elapsed, manually resume. This is
        // idempotent — Stripe ignores the update if there is no pause active.
        if (pauseCollectionPresent) {
          await resumeAfterSuccessfulRenewalPayment(subId);
        }

        // PRIMARY JOB: clear the stale retention metadata so a future
        // failed-renewal-recovery pause on this subscription is NOT mistaken for
        // a retention pause by decideClearPause in pauseCollectionPolicy.ts.
        // Setting metadata keys to "" removes / empties them on update (Stripe docs).
        await stripe.subscriptions.update(subId, {
          metadata: {
            pauseReason: "",
            pauseResumesAt: "",
          },
        });

        cleared += 1;
      } catch (err) {
        // Per-subscription errors are isolated: one bad sub must not block others.
        const msg = `subId=${subId} userId=${String(user._id)}: ${err instanceof Error ? err.message : String(err)}`;
        console.error("[cron cancellation-retention-resume] error processing subscription", msg);
        errors.push(msg);
      }
    }

    console.error(
      "[cron cancellation-retention-resume] done",
      { processed, cleared, flipped, restored, errorCount: errors.length }
    );
    return NextResponse.json({ processed, cleared, flipped, restored, errors });
  } catch (err) {
    console.error("[cron cancellation-retention-resume] fatal error:", err);
    return NextResponse.json(
      {
        processed: 0,
        cleared: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      },
      { status: 500 }
    );
  }
}
