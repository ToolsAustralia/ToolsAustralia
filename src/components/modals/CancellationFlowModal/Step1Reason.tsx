"use client";

import React, { useState } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { type CancellationReason } from "@/models/CancellationFlowEvent";
import type { useStartCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import type { useCancellationFlow } from "./useCancellationFlow";
import { FlowFrame, IconChip, Headline, SubCopy, PrimaryCta } from "./primitives";
import { useUserContext } from "@/contexts/UserContext";

interface ReasonOption {
  label: string;
  value: CancellationReason;
}

const REASON_OPTIONS: ReasonOption[] = [
  { label: "Too expensive right now", value: "too_expensive" },
  { label: "I only joined for a giveaway", value: "joined_for_giveaway" },
  { label: "I haven't won", value: "havent_won" },
  { label: "I don't use the member benefits enough", value: "dont_use_benefits" },
  { label: "I receive too many messages", value: "too_many_messages" },
  { label: "I'd prefer a cheaper membership", value: "prefer_cheaper" },
  { label: "Other", value: "other" },
] satisfies { label: string; value: CancellationReason }[];

interface Step1ReasonProps {
  flowHook: ReturnType<typeof useCancellationFlow>;
  startMutation: ReturnType<typeof useStartCancellationFlow>;
  onClose: () => void;
}

const Step1Reason: React.FC<Step1ReasonProps> = ({ flowHook, startMutation, onClose }) => {
  const { state, selectReason, setReasonText, applyStart } = flowHook;
  const [localText, setLocalText] = useState("");

  // Best-effort first name — optional chaining guards against missing data.
  // CancellationFlowModal always renders inside UserProvider (same as MembershipModal
  // and Header), so useUserContext() is safe to call here unconditionally.
  const { userData } = useUserContext();
  const raw = userData?.firstName;
  const firstName: string | undefined = raw ? raw.split(/\s+/)[0] : undefined;

  const isOther = state.reason === "other";
  // "Other" requires the free-text — admin needs to know what "other" means.
  const otherTextMissing = isOther && localText.trim().length === 0;
  const canContinue = state.reason !== null && !otherTextMissing;
  const isPending = startMutation.isPending;

  const handleReasonChange = (value: CancellationReason) => {
    selectReason(value);
    if (value !== "other") {
      // Clear text when switching away from Other
      setLocalText("");
      setReasonText("");
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalText(val);
    setReasonText(val);
  };

  const handleContinue = async () => {
    if (!state.reason || isPending) return;
    try {
      const result = await startMutation.mutateAsync({
        reason: state.reason,
        reasonText: isOther ? localText.trim() : undefined,
      });
      applyStart({
        eventId: result.eventId,
        offersShown: result.offersShown,
        pastDue: result.pastDue,
      });
    } catch {
      // Error displayed via startMutation.isError / startMutation.error below
    }
  };

  return (
    <FlowFrame onClose={onClose}>
      <IconChip>
        <MessageCircle size={22} strokeWidth={2} />
      </IconChip>
      <Headline>
        {firstName ? `Before you go, ${firstName} —` : "Before you go —"}
        <br />
        what&apos;s making you leave?
      </Headline>
      <SubCopy>No hard sell. Tell us honestly and we&apos;ll see if there&apos;s a better fit than cancelling.</SubCopy>

      <fieldset className="mt-4 flex flex-col gap-2" aria-label="Cancellation reason">
        <legend className="sr-only">Why are you cancelling?</legend>
        {REASON_OPTIONS.map((option) => {
          const isSelected = state.reason === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3 text-[13px] font-semibold transition-all duration-150",
                isSelected
                  ? "border-red-500 bg-gradient-to-b from-red-50 to-red-100/60 text-red-700 shadow-[0_6px_16px_-10px_rgba(238,0,0,.45)] dark:border-red-700 dark:from-red-950/40 dark:to-red-950/10 dark:text-red-300"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
              )}
            >
              <input
                type="radio"
                name="cancellation-reason"
                value={option.value}
                checked={isSelected}
                onChange={() => handleReasonChange(option.value)}
                className="h-4 w-4 shrink-0 accent-red-600"
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>

      {isOther && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor="cancellation-reason-text" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Tell us more <span className="font-semibold text-red-600 dark:text-red-400">(required)</span>
          </label>
          <textarea
            id="cancellation-reason-text"
            value={localText}
            onChange={handleTextChange}
            maxLength={2000}
            rows={3}
            required
            aria-required="true"
            aria-invalid={otherTextMissing}
            placeholder="Please tell us why so we can improve…"
            className={cn(
              "w-full resize-none rounded-[14px] border bg-white px-3 py-2.5 text-sm text-neutral-800 transition-colors placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/40 dark:bg-neutral-900 dark:text-neutral-200",
              otherTextMissing ? "border-red-300 dark:border-red-800" : "border-neutral-200 dark:border-neutral-700"
            )}
          />
          <div className="flex items-center justify-between">
            <p className="text-2xs text-red-600 dark:text-red-400">{otherTextMissing ? "This is required to continue." : " "}</p>
            <p className="text-right text-2xs text-neutral-400 dark:text-neutral-500">{localText.length}/2000</p>
          </div>
        </div>
      )}

      {startMutation.isError && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
          {startMutation.error instanceof Error ? startMutation.error.message : "Something went wrong. Please try again."}
        </p>
      )}

      <PrimaryCta className="mt-[18px]" onClick={() => void handleContinue()} disabled={!canContinue || isPending}>
        {isPending ? "Loading…" : "Continue"}
      </PrimaryCta>
    </FlowFrame>
  );
};

export default Step1Reason;
