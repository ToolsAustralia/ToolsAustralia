import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

/** Mirror of the useAcceptOffer response (kept local — no hook import). */
export interface AcceptResult {
  ok: boolean;
  resumesAt?: string;
  couponId?: string;
}

/**
 * Real, parent-computed entry/membership data for the logged-in member.
 *
 * Surfaced (read-only, never fabricated) on the 50% discount card and the
 * +100 bonus card so the member sees the upside before cancelling. The PARENT
 * (`SubscriptionManagementModal`) assembles this from real `subscriptionBenefits`
 * / resolved `membershipPackage` / `user.subscription.lastMonthAccumulatedEntries`.
 * When the parent cannot assemble every field from real data it passes `null`
 * (or omits the prop) and both cards render exactly as before — no placeholders.
 *
 * NOTE on omitted fields (see docs/subscription/cancellation-flow.md):
 *  - The member's literal *current major-draw entry count* is NOT client-available
 *    (single source of truth is `majordraws.entries`, server-only — User model
 *    intentionally has no per-user major-draw count). `currentEntries` is the
 *    member's accumulated-entries figure (`lastMonthAccumulatedEntries`), which is
 *    the exact number the rest of the dashboard already shows as "your entries".
 *  - `entriesPendingRenewal` is intentionally NOT included: nothing client-side
 *    distinguishes "this period's grant already applied" from "pending". Rather
 *    than fabricate that state, the bonus card frames the next renewal as a
 *    factual statement ("your next renewal adds +N") via `calculateRenewalEntries`.
 */
export interface CancellationEntrySnapshot {
  /** e.g. "tradie-subscription" — drives VerticalAccumulationChart selection. */
  packageId: string;
  /** e.g. "Tradie". */
  packageName: string;
  /** Canonical per-package renewal grant (base entries per month). */
  baseEntriesPerMonth: number;
  /** Member's current accumulated entries (= lastMonthAccumulatedEntries). */
  currentEntries: number;
  /** Accumulated entries from the last renewal — feeds the 2-month projection. */
  lastMonthAccumulatedEntries: number;
  /**
   * Pre-formatted current monthly price label, e.g. "$20/mo".
   *
   * Populated by the parent (`SubscriptionManagementModal`) from the resolved
   * `membershipPackage.price` using the same `$N/mo` convention as `DowngradeList`
   * / `UpgradeList`. Optional — absent when the parent cannot determine a reliable
   * numeric price (e.g. price is 0 or NaN). When absent, `DiscountOfferCard`
   * falls back to the generic "50% off / full price" display exactly as before.
   *
   * The discount card derives `discountedPriceLabel` as 50% of the raw price
   * from the parent — do NOT store a discounted label here; let the card compute
   * it from the authoritative source so the 2-month framing is always consistent.
   */
  currentPriceLabel?: string;
  /**
   * Raw numeric current monthly price in AUD (whole dollars).
   *
   * Stored alongside `currentPriceLabel` so `DiscountOfferCard` can derive the
   * discounted price label (price × 0.5) without re-parsing the formatted string.
   * Optional — absent when `currentPriceLabel` is absent.
   */
  currentPriceAmount?: number;
}

export interface FlowState {
  /**
   * 1 = reason capture, 2 = OFFER phase (cursor-driven over `offersShown` —
   * renders `offersShown[offerCursor]`; declining advances `offerCursor`),
   * 4 = confirm. `3` is retained in the union for backwards type-compat but is
   * never produced by the step-machine (the old hardcoded "step 3 = +100" was
   * the multi-rung-skipping bug). The bonus_entries_100 rung is now just
   * another offer rendered during the step-2 OFFER phase via Step2Offer.
   */
  step: 1 | 2 | 3 | 4;
  reason: CancellationReason | null;
  reasonText: string;
  eventId: string | null;
  offersShown: OfferType[];
  /** Index into `offersShown` for the current OFFER-phase rung (step 2). */
  offerCursor: number;
  pastDue: boolean;
  /** Terminal flag: an offer was accepted — renderer shows StepSaveSuccess. */
  saveSuccess: boolean;
  /** Which offer was accepted (drives the success-screen copy). */
  acceptedOffer: OfferType | null;
  /** The accept response payload (couponId / resumesAt) — may be null. */
  acceptResult: AcceptResult | null;
}

export interface CancellationFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void;
  onSaved: () => void;
  onResolvePayment: () => void;
  /**
   * Called when the user accepts the `tier_downgrade` offer (Step 2).
   * Receives the current `eventId` so the parent can record the outcome ONLY after
   * the downgrade is actually confirmed (not on card click). The parent
   * (SubscriptionManagementModal) stores the eventId in a ref and POSTs
   * `{outcome:"saved",offerAccepted:"tier_downgrade"}` in its downgrade-success handler.
   * The parent is also responsible for closing the CancellationFlowModal without
   * recording any outcome — the event stays in_progress until the downgrade completes.
   */
  onRequestTierDowngrade?: (eventId: string | null) => void;
  /**
   * True when the user's account has at least one available downgrade option.
   * When false and the `tier_downgrade` offer is shown, the Step2Offer renders
   * the `bonus_entries_100` rung instead (no silent dead-end, no false save).
   */
  tierDowngradeAvailable: boolean;
  /**
   * Real, parent-computed entry data for the logged-in member. Optional —
   * `null`/absent → the 50% and +100 cards render exactly as before (no
   * fabricated numbers). See {@link CancellationEntrySnapshot}.
   */
  entrySnapshot?: CancellationEntrySnapshot | null;
}
