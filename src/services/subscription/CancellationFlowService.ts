/**
 * CancellationFlowService
 *
 * Orchestrates the cancellation retention flow: offer routing, event lifecycle,
 * and user context resolution.
 *
 * ## Public API
 *
 * ### Pure (no DB)
 * - `planFlow({ reason, pastDue, consumed })` — composes resolveOfferSequence +
 *   eligibleOffers to return `{ offersShown, pastDue }`. Unit-tested without DB.
 *
 * ### Lifecycle (DB)
 * - `startFlow(...)` — persists a CancellationFlowEvent with outcome "in_progress".
 * - `recordOutcome(...)` — idempotent terminal transition (in_progress → saved|cancelled).
 *
 * ### User context (DB)
 * - `getUserCancellationContext(userId)` — loads the User and derives { pastDue, consumed }.
 *
 * Past-due predicate: `hasFailedRenewal` from `@/utils/subscription/subscription-helpers`
 * (src/utils/subscription/subscription-helpers.ts:31). That function checks
 * subscription.status === "past_due" && !isActive && autoRenew === true — the same
 * predicate the SubscriptionManagementModal uses (index.tsx:120).
 *
 * @see docs/subscription/cancellation-flow.md
 */

import connectDB from "@/lib/mongodb";
import CancellationFlowEvent, {
  type CancellationReason,
  type OfferType,
  type CancellationOutcome,
} from "@/models/CancellationFlowEvent";
import User from "@/models/User";
import { resolveOfferSequence } from "@/utils/subscription/cancellation-flow-routing";
import { eligibleOffers, type ConsumedFlags } from "@/utils/subscription/cancellation-flow-eligibility";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { applyRetentionPause } from "@/services/subscription/RetentionPauseService";
import { applyRetentionDiscount } from "@/services/subscription/RetentionDiscountService";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Pure API
// ---------------------------------------------------------------------------

export interface PlanFlowInput {
  reason: CancellationReason;
  pastDue: boolean;
  consumed: ConsumedFlags;
}

export interface PlanFlowResult {
  offersShown: OfferType[];
  pastDue: boolean;
}

/**
 * Compose routing + eligibility into the ordered list of offers to show.
 * Pure — no DB access, suitable for unit tests.
 */
export function planFlow({ reason, pastDue, consumed }: PlanFlowInput): PlanFlowResult {
  const sequence = resolveOfferSequence(reason);
  const offersShown = eligibleOffers(sequence, { pastDue, consumed });
  return { offersShown, pastDue };
}

// ---------------------------------------------------------------------------
// Lifecycle API (DB)
// ---------------------------------------------------------------------------

export interface StartFlowInput {
  userId: string;
  reason: CancellationReason;
  reasonText?: string;
  pastDue: boolean;
  offersShown: OfferType[];
}

/**
 * Persist a new CancellationFlowEvent with outcome "in_progress".
 * Returns the event _id as a string.
 */
export async function startFlow({
  userId,
  reason,
  reasonText,
  pastDue,
  offersShown,
}: StartFlowInput): Promise<string> {
  await connectDB();
  const event = await CancellationFlowEvent.create({
    userId: new mongoose.Types.ObjectId(userId),
    reason,
    reasonText: reasonText ?? undefined,
    pastDue,
    offersShown,
    outcome: "in_progress",
    startedAt: new Date(),
  });
  return (event._id as mongoose.Types.ObjectId).toString();
}

export interface RecordOutcomeInput {
  eventId: string;
  userId: string;
  outcome: Exclude<CancellationOutcome, "in_progress">;
  offerAccepted?: OfferType;
}

/**
 * Idempotent terminal transition: in_progress → saved | cancelled.
 *
 * The `outcome: "in_progress"` filter in the updateOne query guarantees exactly
 * one terminal transition per event. Subsequent calls with the same eventId are
 * silently ignored (no-op) — callers need not handle the duplicate case.
 */
export async function recordOutcome({
  eventId,
  userId,
  outcome,
  offerAccepted,
}: RecordOutcomeInput): Promise<void> {
  await connectDB();
  const now = new Date();
  const $set: Record<string, unknown> = {
    outcome,
    offerAccepted: offerAccepted ?? null,
    endedAt: now,
  };
  if (outcome === "saved") {
    $set.savedAt = now;
  }
  await CancellationFlowEvent.updateOne(
    {
      _id: new mongoose.Types.ObjectId(eventId),
      userId: new mongoose.Types.ObjectId(userId),
      outcome: "in_progress",
    },
    { $set }
  );
}

// ---------------------------------------------------------------------------
// User context API (DB)
// ---------------------------------------------------------------------------

export interface UserCancellationContext {
  pastDue: boolean;
  consumed: ConsumedFlags;
}

/**
 * Load the User and derive the pastDue flag + consumed offer flags needed
 * to call planFlow.
 *
 * Past-due predicate: `hasFailedRenewal` (subscription-helpers.ts:31).
 *   → status === "past_due" && !isActive && autoRenew === true
 *
 * ConsumedFlags mapping:
 *   - pause30d          ← user.retentionOffersConsumed?.pause30d
 *   - discount50_2mo    ← user.retentionOffersConsumed?.discount50_2mo
 *   - bonusEntries100   ← user.cancellationUpsellRedeemed (legacy field)
 *
 * Throws `Error("user not found")` when userId does not match any document.
 * Callers (route handlers) should map this to a 404 response.
 */
export async function getUserCancellationContext(userId: string): Promise<UserCancellationContext> {
  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new Error("user not found");
  }
  const pastDue = hasFailedRenewal(user);
  const consumed: ConsumedFlags = {
    pause30d: !!user.retentionOffersConsumed?.pause30d,
    discount50_2mo: !!user.retentionOffersConsumed?.discount50_2mo,
    bonusEntries100: !!user.cancellationUpsellRedeemed,
  };
  return { pastDue, consumed };
}

// ---------------------------------------------------------------------------
// Accept-offer API (DB + Stripe) — Phase 3
// ---------------------------------------------------------------------------

/**
 * Typed error carrying the HTTP status the route should return. Lets the route
 * stay thin: it does a single `instanceof AcceptOfferError` check and echoes
 * `{ error: message }` with `error.status`. This mirrors the route's existing
 * `"user not found" → 404` message-mapping pattern, just promoted to a class so
 * the status decision lives in the service (business layer), not the handler.
 */
export class AcceptOfferError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AcceptOfferError";
    this.status = status;
  }
}

export interface AcceptOfferInput {
  userId: string;
  eventId: string;
  offer: OfferType;
}

export interface AcceptOfferResult {
  resumesAt?: string; // ISO-8601, only present for pause_30d
  couponId?: string; // Stripe coupon id, only present for discount_50_2mo
}

/**
 * Map a retention-offer service typed error message to the HTTP status the
 * route returns. Centralised so the contract is auditable in one place.
 *
 * Covers BOTH `RetentionPauseService` and `RetentionDiscountService` message
 * sets (the two share the same status semantics — a single shared helper keeps
 * the contract DRY, see Task 16):
 *
 *   "retention pause already used"             → 409
 *   "retention discount already used"          → 409
 *   "past-due: retention pause not allowed"    → 409
 *   "past-due: retention discount not allowed" → 409
 *   "no active subscription"                   → 409
 *   "user not found"                           → 404
 *   anything else                              → 500
 */
function retentionOfferErrorToStatus(message: string): number {
  switch (message) {
    case "retention pause already used":
    case "retention discount already used":
    case "past-due: retention pause not allowed":
    case "past-due: retention discount not allowed":
    case "no active subscription":
      return 409;
    case "user not found":
      return 404;
    default:
      return 500;
  }
}

/**
 * Accept a retention offer.
 *
 * Supported offers: `pause_30d` (Task 14), `discount_50_2mo` (Task 16). Any
 * other offer value throws `AcceptOfferError("unsupported offer", 400)` —
 * Task 17 extends this for `unsubscribe_marketing`.
 *
 * `pause_30d` flow:
 *   1. `applyRetentionPause(userId)` — pauses the Stripe subscription 30 days.
 *   2. On success, `recordOutcome({ outcome: "saved", offerAccepted: "pause_30d" })`.
 *   3. Returns `{ resumesAt }`.
 *
 * `discount_50_2mo` flow:
 *   1. `applyRetentionDiscount(userId)` — attaches the 50%-off/2mo singleton
 *      coupon to the Stripe subscription.
 *   2. On success, `recordOutcome({ outcome: "saved", offerAccepted: "discount_50_2mo" })`.
 *   3. Returns `{ couponId }`.
 *
 * Both `applyRetentionPause` and `applyRetentionDiscount` throw typed `Error`s;
 * their messages are mapped to an HTTP status via the shared
 * `retentionOfferErrorToStatus` and re-thrown as `AcceptOfferError` so the route
 * can surface the correct status without embedding any business logic. A
 * `500`-class (unmatched) error is re-thrown unwrapped so the route's generic
 * handler logs and returns 500.
 */
export async function acceptOffer({
  userId,
  eventId,
  offer,
}: AcceptOfferInput): Promise<AcceptOfferResult> {
  if (offer === "pause_30d") {
    let resumesAt: string;
    try {
      ({ resumesAt } = await applyRetentionPause(userId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      const status = retentionOfferErrorToStatus(message);
      if (status === 500) {
        // Unexpected (e.g. Stripe API failure) — preserve the original for logs.
        throw err;
      }
      throw new AcceptOfferError(message, status);
    }

    await recordOutcome({
      eventId,
      userId,
      outcome: "saved",
      offerAccepted: "pause_30d",
    });

    return { resumesAt };
  }

  if (offer === "discount_50_2mo") {
    let couponId: string;
    try {
      ({ couponId } = await applyRetentionDiscount(userId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      const status = retentionOfferErrorToStatus(message);
      if (status === 500) {
        // Unexpected (e.g. Stripe API failure) — preserve the original for logs.
        throw err;
      }
      throw new AcceptOfferError(message, status);
    }

    await recordOutcome({
      eventId,
      userId,
      outcome: "saved",
      offerAccepted: "discount_50_2mo",
    });

    return { couponId };
  }

  throw new AcceptOfferError("unsupported offer", 400);
}
