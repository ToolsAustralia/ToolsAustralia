"use client";

/**
 * Step2Offer — renders the lead offer for the current cancellation flow step.
 *
 * Receives the current offer = state.offersShown[state.offerCursor] and dispatches
 * to the correct card via an exhaustive typed switch over OfferType.
 *
 * IMPLEMENTED offers (Task 17: ALL OfferTypes now render a real card —
 * no throw cases remain; the `never`-guard default is now genuinely
 * unreachable and kept purely as a compile-time exhaustiveness safety net):
 *   bonus_entries_100     → renders Step3BonusEntries inline (same +100 content)
 *   tier_downgrade        → "Switch to a cheaper plan instead?" card
 *   pause_30d             → "Pause 30 days — keep your entries" card (Task 14)
 *   discount_50_2mo       → "50% off for 2 months" card (Task 16)
 *   unsubscribe_marketing → "Get fewer messages instead" card (Task 17) —
 *     stops MARKETING email + SMS only; transactional / account emails
 *     (receipts, renewals, draw results) are untouched.
 *
 * Task 6: every card is now rendered on the shared primitive grammar
 * (FlowFrame / Eyebrow / Headline / SubCopy / ValueCard / FeatureRow /
 * PrimaryCta / TextDecline) with a desktop two-column layout and a
 * "Tailored for you · Offer n of total" eyebrow. The pause / discount /
 * unsubscribe accept success branch now calls `onAcceptedOffer(offer, result)`
 * (so the Save Success screen shows) instead of `onSaved()`. tier_downgrade
 * still exits via `onRequestTierDowngrade` (parent owns the downgrade modal).
 */

import React, { useState } from "react";
import { ApiError } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type { AcceptResult, FlowState } from "./types";
import type { useOutcomeCancellationFlow, useAcceptOffer } from "@/hooks/queries/useCancellationFlow";
import Step3BonusEntries from "./Step3BonusEntries";
import {
  FlowFrame,
  Eyebrow,
  Headline,
  SubCopy,
  ValueCard,
  FeatureRow,
  PrimaryCta,
  TextDecline,
} from "./primitives";

interface Step2OfferProps {
  state: FlowState;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  /** Still used by the Step3BonusEntries delegation (bonus_entries_100 + fallback). */
  onSaved: () => void;
  onDecline: () => void;
  /** Branded header close — threaded into each card's FlowFrame. */
  onClose: () => void;
  /**
   * Called when pause / discount / unsubscribe is accepted. Drives the
   * Save Success screen (parent maps this to flowHook.markSaved).
   */
  onAcceptedOffer: (offer: OfferType, result: AcceptResult | null) => void;
  /** Called when the user picks tier-downgrade. Parent maps this to its existing downgrade opener. */
  onRequestTierDowngrade?: (eventId: string | null) => void;
  /**
   * True when the user has at least one available downgrade option.
   * When false and the current offer is tier_downgrade, Step3BonusEntries is rendered instead.
   */
  tierDowngradeAvailable: boolean;
}

/** "Offer n of total" — the persuasion eyebrow tail. */
const offerLabelFor = (state: FlowState): string =>
  `Offer ${state.offerCursor + 1} of ${state.offersShown.length}`;

/** CTA + decline pair, rendered once per breakpoint slot so the two copies can't drift. */
const OfferActions: React.FC<{
  acceptLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  disabled?: boolean;
  declineLabel?: string;
}> = ({
  acceptLabel,
  onAccept,
  onDecline,
  disabled = false,
  declineLabel = "No thanks, show me other options",
}) => (
  <>
    <PrimaryCta className="mt-[17px]" onClick={onAccept} disabled={disabled}>
      {acceptLabel}
    </PrimaryCta>
    <TextDecline onClick={onDecline} disabled={disabled}>
      {declineLabel}
    </TextDecline>
  </>
);

// ---------------------------------------------------------------------------
// tier_downgrade card
// ---------------------------------------------------------------------------

interface TierDowngradeCardProps {
  state: FlowState;
  onClose: () => void;
  onDecline: () => void;
  onRequestTierDowngrade?: (eventId: string | null) => void;
}

const TierDowngradeCard: React.FC<TierDowngradeCardProps> = ({
  state,
  onClose,
  onDecline,
  onRequestTierDowngrade,
}) => {
  const offerLabel = offerLabelFor(state);

  const handleAccept = () => {
    // Do NOT record outcome here — the outcome is only recorded if the downgrade
    // is actually confirmed in DowngradeConfirmModal. Pass the eventId to the parent
    // so it can POST {outcome:"saved",offerAccepted:"tier_downgrade"} on real success.
    // The parent will also close this modal without calling onSaved.
    onRequestTierDowngrade?.(state.eventId);
  };

  return (
    <FlowFrame onClose={onClose}>
      <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-6">
        <div>
          <Eyebrow>Tailored for you · {offerLabel}</Eyebrow>
          <Headline>
            Want something
            <br />
            lighter?
          </Headline>
          <SubCopy>
            Switch to a cheaper plan and keep every entry — no need to cancel.
          </SubCopy>
          <div className="hidden lg:block">
            <OfferActions
              acceptLabel="Switch to a cheaper plan"
              onAccept={handleAccept}
              onDecline={onDecline}
            />
          </div>
        </div>
        <div>
          <ValueCard>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-neutral-400">
              A lighter plan
            </div>
            <div className="mt-3.5 border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-700">
              <FeatureRow>Every entry carries over</FeatureRow>
              <FeatureRow>Pay less each month</FeatureRow>
              <FeatureRow>Cancel anytime</FeatureRow>
            </div>
          </ValueCard>
          <div className="lg:hidden">
            <OfferActions
              acceptLabel="Switch to a cheaper plan"
              onAccept={handleAccept}
              onDecline={onDecline}
            />
          </div>
        </div>
      </div>
    </FlowFrame>
  );
};

// ---------------------------------------------------------------------------
// pause_30d card
// ---------------------------------------------------------------------------

interface PauseOfferCardProps {
  state: FlowState;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  onClose: () => void;
  onDecline: () => void;
  onAcceptedOffer: (offer: OfferType, result: AcceptResult | null) => void;
}

const PauseOfferCard: React.FC<PauseOfferCardProps> = ({
  state,
  acceptOfferMutation,
  onClose,
  onDecline,
  onAcceptedOffer,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();
  const offerLabel = offerLabelFor(state);

  const handleAccept = async () => {
    if (isProcessing) return;
    if (!state.eventId) {
      // No event id should never happen at Step 2 — degrade gracefully.
      onDecline();
      return;
    }
    setIsProcessing(true);
    try {
      const result = await acceptOfferMutation.mutateAsync({
        eventId: state.eventId,
        offer: "pause_30d",
      });
      onAcceptedOffer("pause_30d", result);
    } catch (error) {
      // The eligibility filter should have prevented an already-used / past-due
      // / no-subscription member from ever reaching this card. If it slipped
      // through, the server returns 409 (or 404). Don't dead-end: surface a
      // brief message and advance to the next rung via onDecline().
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 || status === 404) {
        showToast({
          type: "info",
          title: "Pause unavailable",
          message:
            error instanceof Error
              ? error.message
              : "This pause offer isn't available on your account.",
          duration: 6000,
        });
        onDecline();
        return;
      }
      showToast({
        type: "error",
        title: "Couldn't pause your membership",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <FlowFrame onClose={onClose}>
      <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-6">
        <div>
          <Eyebrow>Tailored for you · {offerLabel}</Eyebrow>
          <Headline>
            Need a break,
            <br />
            not a breakup?
          </Headline>
          <SubCopy>
            Pause for 30 days — no payments, and every entry you&apos;ve earned
            stays exactly where it is.
          </SubCopy>
          <div className="hidden lg:block">
            <OfferActions
              acceptLabel={isProcessing ? "Pausing…" : "Pause my membership"}
              onAccept={() => void handleAccept()}
              onDecline={onDecline}
              disabled={isProcessing}
            />
          </div>
        </div>
        <div>
          <ValueCard>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-neutral-400">
              Pause · 30 days
            </div>
            <div className="mt-3.5 border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-700">
              <FeatureRow>30 days off — no charge</FeatureRow>
              <FeatureRow>Entries frozen, not lost</FeatureRow>
              <FeatureRow>Auto-resumes after the pause</FeatureRow>
            </div>
          </ValueCard>
          <div className="lg:hidden">
            <OfferActions
              acceptLabel={isProcessing ? "Pausing…" : "Pause my membership"}
              onAccept={() => void handleAccept()}
              onDecline={onDecline}
              disabled={isProcessing}
            />
          </div>
        </div>
      </div>
    </FlowFrame>
  );
};

// ---------------------------------------------------------------------------
// discount_50_2mo card
// ---------------------------------------------------------------------------

interface DiscountOfferCardProps {
  state: FlowState;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  onClose: () => void;
  onDecline: () => void;
  onAcceptedOffer: (offer: OfferType, result: AcceptResult | null) => void;
}

const DiscountOfferCard: React.FC<DiscountOfferCardProps> = ({
  state,
  acceptOfferMutation,
  onClose,
  onDecline,
  onAcceptedOffer,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();
  const offerLabel = offerLabelFor(state);

  const handleAccept = async () => {
    if (isProcessing) return;
    if (!state.eventId) {
      // No event id should never happen at Step 2 — degrade gracefully.
      onDecline();
      return;
    }
    setIsProcessing(true);
    try {
      const result = await acceptOfferMutation.mutateAsync({
        eventId: state.eventId,
        offer: "discount_50_2mo",
      });
      onAcceptedOffer("discount_50_2mo", result);
    } catch (error) {
      // The eligibility filter should have prevented an already-used / past-due
      // / no-subscription member from ever reaching this card. If it slipped
      // through, the server returns 409 (or 404). Don't dead-end: surface a
      // brief message and advance to the next rung via onDecline().
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 || status === 404) {
        showToast({
          type: "info",
          title: "Discount unavailable",
          message:
            error instanceof Error
              ? error.message
              : "This discount offer isn't available on your account.",
          duration: 6000,
        });
        onDecline();
        return;
      }
      showToast({
        type: "error",
        title: "Couldn't apply your discount",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <FlowFrame onClose={onClose}>
      <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-6">
        <div>
          <Eyebrow>Tailored for you · {offerLabel}</Eyebrow>
          <Headline>
            Keep everything —
            <br />
            at half the price.
          </Headline>
          <SubCopy>
            You said price is the issue, so here&apos;s the strongest thing we can do:{" "}
            <strong className="text-neutral-900 dark:text-white">50% off your next 2 months</strong>. Nothing else changes.
          </SubCopy>
          <div className="hidden lg:block">
            <OfferActions
              acceptLabel={isProcessing ? "Applying…" : "Keep me at 50% off"}
              onAccept={() => void handleAccept()}
              onDecline={onDecline}
              disabled={isProcessing}
              declineLabel="That's okay, show me other options"
            />
          </div>
        </div>
        <div>
          <ValueCard glow>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-neutral-400">
              Your new price · 2 months
            </div>
            <div className="mt-1.5 flex items-center">
              <div className="text-[30px] font-black tracking-[-0.03em] text-neutral-900 dark:text-white">
                50% off
                <span className="ml-2 text-[15px] font-bold text-neutral-400 line-through">
                  full price
                </span>
              </div>
              <span className="ml-auto rounded-full bg-gradient-to-br from-amber-300 to-amber-400 px-2.5 py-1 text-[10.5px] font-black text-amber-900 shadow-[0_4px_10px_rgba(245,158,11,.35)]">
                SAVE 50%
              </span>
            </div>
            <div className="mt-3.5 border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-700">
              <FeatureRow>Every accumulated entry stays locked in</FeatureRow>
              <FeatureRow>Same shot at the major draw &amp; $10k cash</FeatureRow>
              <FeatureRow>Cancel anytime — zero lock-in</FeatureRow>
            </div>
          </ValueCard>
          <div className="lg:hidden">
            <OfferActions
              acceptLabel={isProcessing ? "Applying…" : "Keep me at 50% off"}
              onAccept={() => void handleAccept()}
              onDecline={onDecline}
              disabled={isProcessing}
              declineLabel="That's okay, show me other options"
            />
          </div>
        </div>
      </div>
    </FlowFrame>
  );
};

// ---------------------------------------------------------------------------
// unsubscribe_marketing card
// ---------------------------------------------------------------------------

interface UnsubscribeOfferCardProps {
  state: FlowState;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  onClose: () => void;
  onDecline: () => void;
  onAcceptedOffer: (offer: OfferType, result: AcceptResult | null) => void;
}

const UnsubscribeOfferCard: React.FC<UnsubscribeOfferCardProps> = ({
  state,
  acceptOfferMutation,
  onClose,
  onDecline,
  onAcceptedOffer,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();
  const offerLabel = offerLabelFor(state);

  const handleAccept = async () => {
    if (isProcessing) return;
    if (!state.eventId) {
      // No event id should never happen at Step 2 — degrade gracefully.
      onDecline();
      return;
    }
    setIsProcessing(true);
    try {
      const result = await acceptOfferMutation.mutateAsync({
        eventId: state.eventId,
        offer: "unsubscribe_marketing",
      });
      onAcceptedOffer("unsubscribe_marketing", result);
    } catch (error) {
      // unsubscribe_marketing has no 409 path (not one-time gated, no past-due
      // guard). A 404 (user vanished) or 500 can still occur — don't dead-end:
      // surface a brief message and advance to the next rung via onDecline().
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 || status === 404) {
        showToast({
          type: "info",
          title: "Couldn't update your preferences",
          message:
            error instanceof Error
              ? error.message
              : "We couldn't update your message preferences just now.",
          duration: 6000,
        });
        onDecline();
        return;
      }
      showToast({
        type: "error",
        title: "Couldn't update your preferences",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <FlowFrame onClose={onClose}>
      <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-6">
        <div>
          <Eyebrow>Tailored for you · {offerLabel}</Eyebrow>
          <Headline>
            Too much
            <br />
            noise?
          </Headline>
          <SubCopy>
            Don&apos;t cancel — just get fewer messages. We&apos;ll switch off
            marketing email and marketing SMS only. Receipts, renewal notices
            and draw results are not affected.
          </SubCopy>
          <div className="hidden lg:block">
            <OfferActions
              acceptLabel={isProcessing ? "Updating…" : "Send me fewer messages"}
              onAccept={() => void handleAccept()}
              onDecline={onDecline}
              disabled={isProcessing}
            />
          </div>
        </div>
        <div>
          <ValueCard>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-neutral-400">
              Fewer messages
            </div>
            <div className="mt-3.5 border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-700">
              <FeatureRow>Marketing email + SMS switched off</FeatureRow>
              <FeatureRow>Receipts, renewals &amp; draw results still arrive</FeatureRow>
              <FeatureRow>Every entry keeps building</FeatureRow>
            </div>
          </ValueCard>
          <div className="lg:hidden">
            <OfferActions
              acceptLabel={isProcessing ? "Updating…" : "Send me fewer messages"}
              onAccept={() => void handleAccept()}
              onDecline={onDecline}
              disabled={isProcessing}
            />
          </div>
        </div>
      </div>
    </FlowFrame>
  );
};

// ---------------------------------------------------------------------------
// Step2Offer — exhaustive switch
// ---------------------------------------------------------------------------

const Step2Offer: React.FC<Step2OfferProps> = ({
  state,
  outcomeMutation,
  acceptOfferMutation,
  onDecline,
  onClose,
  onAcceptedOffer,
  onRequestTierDowngrade,
  tierDowngradeAvailable,
}) => {
  const offer: OfferType = state.offersShown[state.offerCursor];

  switch (offer) {
    case "bonus_entries_100":
      // When bonus_entries_100 is the LEAD offer (e.g. joined_for_giveaway / havent_won),
      // render the same content as Step3BonusEntries — it is Step3BonusEntries.
      return (
        <Step3BonusEntries
          state={state}
          outcomeMutation={outcomeMutation}
          onClose={onClose}
          onAcceptedOffer={onAcceptedOffer}
          onDecline={onDecline}
        />
      );

    case "tier_downgrade":
      // Bug 2: if no downgrade options exist, skip straight to the +100 rung.
      // For prefer_cheaper the sequence is [tier_downgrade, bonus_entries_100]; if
      // tier is unavailable the user should get the +100 offer immediately rather
      // than a dead card that silently does nothing.
      if (!tierDowngradeAvailable) {
        return (
          <Step3BonusEntries
            state={state}
            outcomeMutation={outcomeMutation}
            onClose={onClose}
            onAcceptedOffer={onAcceptedOffer}
            onDecline={onDecline}
          />
        );
      }
      return (
        <TierDowngradeCard
          state={state}
          onClose={onClose}
          onDecline={onDecline}
          onRequestTierDowngrade={onRequestTierDowngrade}
        />
      );

    case "pause_30d":
      // Task 14: real pause card. Accept → useAcceptOffer → onAcceptedOffer
      // (Save Success); decline → onDecline (next rung). 409/404 (filter
      // slipped) → toast + onDecline.
      return (
        <PauseOfferCard
          state={state}
          acceptOfferMutation={acceptOfferMutation}
          onClose={onClose}
          onDecline={onDecline}
          onAcceptedOffer={onAcceptedOffer}
        />
      );

    case "discount_50_2mo":
      // Task 16: real discount card. Accept → useAcceptOffer → onAcceptedOffer
      // (Save Success); decline → onDecline (next rung). 409/404 (filter
      // slipped) → toast + onDecline.
      return (
        <DiscountOfferCard
          state={state}
          acceptOfferMutation={acceptOfferMutation}
          onClose={onClose}
          onDecline={onDecline}
          onAcceptedOffer={onAcceptedOffer}
        />
      );

    case "unsubscribe_marketing":
      // Task 17: real unsubscribe card. Accept → useAcceptOffer →
      // onAcceptedOffer (Save Success); decline → onDecline (next rung). No
      // 409 path (not one-time gated, no past-due guard); 404/500 (rare) →
      // toast + onDecline.
      return (
        <UnsubscribeOfferCard
          state={state}
          acceptOfferMutation={acceptOfferMutation}
          onClose={onClose}
          onDecline={onDecline}
          onAcceptedOffer={onAcceptedOffer}
        />
      );

    default: {
      // Exhaustiveness guard — TypeScript will error here if OfferType gains a new member
      // that is not handled above. As of Task 17 ALL OfferTypes render a real
      // card, so this branch is genuinely unreachable — kept intentionally as a
      // compile-time safety net for any future OfferType addition.
      const _exhaustive: never = offer;
      throw new Error(`unhandled offer: ${String(_exhaustive)}`);
    }
  }
};

export default Step2Offer;
