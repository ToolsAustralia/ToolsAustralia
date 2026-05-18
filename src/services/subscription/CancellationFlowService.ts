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
