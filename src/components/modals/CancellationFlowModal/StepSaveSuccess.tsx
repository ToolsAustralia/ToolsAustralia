"use client";

/**
 * StepSaveSuccess — post-accept confirmation. Shown (instead of the modal
 * silently closing) after discount_50_2mo / pause_30d / unsubscribe_marketing /
 * bonus_entries_100 is accepted. tier_downgrade does NOT use this (it exits to
 * the parent downgrade modal). Pure presentation; CTA calls onDone() which is
 * the existing parent onSaved().
 */

import React from "react";
import { Check } from "lucide-react";
import { FlowFrame, ValueCard, FeatureRow, PrimaryCta, Headline } from "./primitives";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type { AcceptResult } from "./types";

interface Props {
  offer: OfferType;
  result: AcceptResult | null;
  firstName?: string;
  onClose: () => void;
  onDone: () => void;
}

function lines(offer: OfferType, result: AcceptResult | null): string[] {
  switch (offer) {
    case "discount_50_2mo":
      return [
        "50% off applied for your next 2 months",
        "Every accumulated entry stays locked in",
        "Same shot at the major draw — nothing changed",
      ];
    case "pause_30d": {
      const ts = result?.resumesAt ? new Date(result.resumesAt).getTime() : NaN;
      const when = Number.isNaN(ts) ? null : new Date(ts).toLocaleDateString();
      return [
        when ? `Paused — billing resumes ${when}` : "Paused for 30 days — no charges",
        "Entries frozen, not lost",
        "Auto-resumes after the pause",
      ];
    }
    case "unsubscribe_marketing":
      return [
        "Marketing email + SMS switched off",
        "Receipts, renewals & draw results still arrive",
        "Every entry keeps building",
      ];
    case "bonus_entries_100":
      return [
        "+100 bonus entries added to the major draw",
        "All your existing entries stay locked in",
        "You're still in for the $10,000 cash draw",
      ];
    default:
      return ["Your membership is staying active."];
  }
}

const StepSaveSuccess: React.FC<Props> = ({ offer, result, firstName, onClose, onDone }) => (
  <FlowFrame onClose={onClose} trust={false}>
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-emerald-50 shadow-[0_0_0_10px_rgba(16,163,74,.07),0_0_0_22px_rgba(16,163,74,.04)] dark:bg-emerald-950/40">
        <span className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-emerald-600 text-white motion-safe:animate-[scaleIn_.35s_ease-out_forwards]">
          <Check size={26} strokeWidth={3} aria-hidden="true" />
        </span>
      </span>
      <Headline>{firstName ? `You're all set, ${firstName}.` : "You're all set."}</Headline>
    </div>
    <ValueCard className="text-left">
      {lines(offer, result).map((l) => (
        <FeatureRow key={l}>{l}</FeatureRow>
      ))}
    </ValueCard>
    <PrimaryCta className="mt-[18px]" onClick={onDone}>
      Back to my account
    </PrimaryCta>
  </FlowFrame>
);

export default StepSaveSuccess;
