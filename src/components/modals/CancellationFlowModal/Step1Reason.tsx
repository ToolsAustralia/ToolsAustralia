"use client";

import React, { useState } from "react";
import { cn } from "@/utils/cn";
import { type CancellationReason } from "@/models/CancellationFlowEvent";
import type { useStartCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import type { useCancellationFlow } from "./useCancellationFlow";

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
}

const Step1Reason: React.FC<Step1ReasonProps> = ({ flowHook, startMutation }) => {
  const { state, selectReason, setReasonText, applyStart } = flowHook;
  const [localText, setLocalText] = useState("");

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
    <div className="flex flex-col gap-4 p-4 max-xs:p-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug">
        Help us understand why you&apos;re leaving. We&apos;ll try to make it right.
      </p>

      <fieldset className="flex flex-col gap-2" aria-label="Cancellation reason">
        <legend className="sr-only">Why are you cancelling?</legend>
        {REASON_OPTIONS.map((option) => {
          const isSelected = state.reason === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex items-start gap-3 rounded-xl border cursor-pointer px-3.5 py-3 transition-all duration-150",
                isSelected
                  ? "border-red-500 bg-red-50 dark:bg-red-950/30 dark:border-red-700"
                  : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
              )}
            >
              <input
                type="radio"
                name="cancellation-reason"
                value={option.value}
                checked={isSelected}
                onChange={() => handleReasonChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
              />
              <span
                className={cn(
                  "text-sm font-medium leading-snug",
                  isSelected
                    ? "text-red-700 dark:text-red-300"
                    : "text-neutral-800 dark:text-neutral-200"
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* Required free-text for "Other" — admin needs to know what it is */}
      {isOther && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cancellation-reason-text"
            className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
          >
            Tell us more <span className="text-red-600 dark:text-red-400 font-semibold">(required)</span>
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
              "w-full rounded-xl border bg-white dark:bg-neutral-900 text-sm text-neutral-800 dark:text-neutral-200 px-3 py-2.5 resize-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 transition-colors",
              otherTextMissing
                ? "border-red-300 dark:border-red-800 focus:ring-red-500/40 focus:border-red-400"
                : "border-neutral-200 dark:border-neutral-700 focus:ring-red-500/40 focus:border-red-400"
            )}
          />
          <div className="flex items-center justify-between">
            <p className="text-2xs text-red-600 dark:text-red-400">
              {otherTextMissing ? "This is required to continue." : " "}
            </p>
            <p className="text-right text-2xs text-neutral-400 dark:text-neutral-500">
              {localText.length}/2000
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {startMutation.isError && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {startMutation.error instanceof Error
            ? startMutation.error.message
            : "Something went wrong. Please try again."}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleContinue()}
        disabled={!canContinue || isPending}
        className={cn(
          "w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-150",
          "bg-gradient-to-b from-red-600 to-red-800 text-white border border-red-800",
          "shadow-[0_6px_16px_rgba(238,0,0,0.22)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_10px_22px_rgba(238,0,0,0.32)]",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isPending ? "Loading…" : "Continue"}
      </button>
    </div>
  );
};

export default Step1Reason;
