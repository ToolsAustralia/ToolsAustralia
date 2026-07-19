"use client";

/**
 * StepStakes — the Membership Streak stakes screen (spec §7b M3).
 *
 * Shown right after reason capture for every non-past-due member while the
 * streak feature is live — ALWAYS shown (owner decision), only the CONTENT
 * adapts to streak depth:
 *   - streak ≥ 2  → LOSS framing: what they've forged + the next milestone
 *                   they'd walk away from; pause reframed as streak-freeze.
 *   - streak 0/1  → FORWARD framing: the ladder they're about to start
 *                   (streak 1 is ONE renewal from +100 — call that out).
 *
 * Copy rules (CLAUDE.md rule 11): "free entries" always; a streak is kept by
 * KEEPING the membership — never bought. The 30-day rejoin grace is deliberately
 * NOT advertised here (truthful omission; Cobber's FAQ discloses it on request).
 *
 * "Continue cancelling" is always visible — this screen informs, never traps.
 * Both exits fire a fire-and-forget stakes event ("kept" / "continued") so the
 * save-rate lift is measured per streak depth, never asserted.
 */

import React from "react";
import { Flame } from "lucide-react";
import { FlowFrame, IconChip, Headline, SubCopy, ValueCard, FeatureRow, UrgencyStrip, PrimaryCta, TextDecline } from "./primitives";
import { STREAK_MILESTONES, nextStreakMilestone } from "@/config/streakMilestones";
import type { FlowState } from "./types";
import type { useStakesActionCancellationFlow } from "@/hooks/queries/useCancellationFlow";

/** 2 → "2nd"; every other rung level (4/6/8/10/12) is a plain "Nth". */
const ordinal = (n: number): string => (n % 10 === 2 && n % 100 !== 12 ? `${n}nd` : `${n}th`);

interface StepStakesProps {
  state: FlowState;
  stakesMutation: ReturnType<typeof useStakesActionCancellationFlow>;
  /** Keep-membership exit — parent closes the modal (mirrors Step4Confirm's keep). */
  onKeep: () => void;
  /** Proceed to the offer waterfall. */
  onContinue: () => void;
  onClose: () => void;
}

const StepStakes: React.FC<StepStakesProps> = ({ state, stakesMutation, onKeep, onContinue, onClose }) => {
  const streak = Math.max(state.streakMonths, 0);
  const next = nextStreakMilestone(streak);
  const lossFraming = streak >= 2;

  const record = (stakesAction: "kept" | "continued") => {
    // Fire-and-forget analytics — never block the member's exit on it.
    if (state.eventId) {
      stakesMutation.mutate({ eventId: state.eventId, stakesAction });
    }
  };

  const handleKeep = () => {
    record("kept");
    onKeep();
  };

  const handleContinue = () => {
    record("continued");
    onContinue();
  };

  return (
    <FlowFrame onClose={onClose}>
      <IconChip tone="gold">
        <Flame size={22} strokeWidth={2} />
      </IconChip>

      {lossFraming ? (
        <>
          <Headline>
            Your {streak}-renewal streak
            <br />
            is on the line
          </Headline>
          <SubCopy>
            You&apos;ve kept your membership going {streak} renewals in a row. Here&apos;s what cancelling walks away
            from:
          </SubCopy>
          <ValueCard glow>
            <FeatureRow>
              <b>{streak} consecutive renewals</b>&nbsp;banked — your streak stops building the moment your membership
              ends
            </FeatureRow>
            <FeatureRow>
              Next milestone:&nbsp;<b>+{next.entries} free entries</b>&nbsp;at your {ordinal(next.level)} renewal —{" "}
              {next.toGo === 1 ? "just ONE renewal away" : `${next.toGo} renewals away`}
            </FeatureRow>
            <FeatureRow>
              Rather take a break? <b>Pausing freezes your streak</b> — it carries straight on when you&apos;re back
            </FeatureRow>
          </ValueCard>
          <UrgencyStrip>A streak can&apos;t be bought — it can only be kept. A full lapse resets it to zero.</UrgencyStrip>
        </>
      ) : (
        <>
          <Headline>
            Your streak is just
            <br />
            getting started
          </Headline>
          <SubCopy>
            {streak === 1
              ? "You're ONE renewal away from your first streak milestone. Every consecutive renewal builds it:"
              : "Every consecutive renewal builds your Membership Streak — milestone renewals include free entries automatically:"}
          </SubCopy>
          <ValueCard glow>
            {STREAK_MILESTONES.map((rung) => (
              <FeatureRow key={rung.level}>
                {ordinal(rung.level)} renewal →&nbsp;<b>+{rung.entries} free entries</b>
                {rung.level === 12 ? <>&nbsp;+ the permanent Founding badge</> : null}
              </FeatureRow>
            ))}
          </ValueCard>
          <UrgencyStrip>
            The ladder repeats every year you stay — cancelling now means starting it later from zero.
          </UrgencyStrip>
        </>
      )}

      <PrimaryCta className="mt-3.5" onClick={handleKeep}>
        {lossFraming ? "Keep my streak" : "Keep my membership"}
      </PrimaryCta>
      <TextDecline onClick={handleContinue}>Continue cancelling</TextDecline>
    </FlowFrame>
  );
};

export default StepStakes;
