import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

export interface FlowState {
  step: 1 | 2 | 3 | 4;
  reason: CancellationReason | null;
  reasonText: string;
  eventId: string | null;
  offersShown: OfferType[];
  offerCursor: number;
  pastDue: boolean;
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
}
