"use client";
import React from "react";

/**
 * Two complementary status pills shown together on every Health row:
 *
 *  - LiveStatusPill — "is the adset actually delivering right now?" (Meta's
 *    effective_status). ACTIVE → green "Live"; any flavour of paused →
 *    gray "Paused"; archived/deleted/issues → their own colours.
 *
 *  - LearningStatusPill — Meta's learning_stage_info bucket. "Active" here
 *    DOES NOT mean "running" — it means the adset has exited the learning
 *    phase by reaching ~50 optimization events in a 7-day window. The
 *    title-tooltip on each pill spells out exactly what each label means so
 *    the colour-coding alone never has to carry the meaning.
 *
 * Shared between PivotTable, FlatTable and MobileCards to keep the colour
 * palette and copy in lockstep — desktop and mobile must never disagree.
 */

export type EffectiveStatusUi =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "PENDING_REVIEW"
  | "DISAPPROVED"
  | "PREAPPROVED"
  | "PENDING_BILLING_INFO"
  | "CAMPAIGN_PAUSED"
  | "ARCHIVED"
  | "ADSET_PAUSED"
  | "IN_PROCESS"
  | "WITH_ISSUES"
  | "UNKNOWN";

export type LearningBucketUi = "Active" | "Learning" | "LearningLimited" | "Unknown";

interface LivePillSpec {
  label: string;
  className: string;
  title: string;
}

function liveSpec(status: EffectiveStatusUi): LivePillSpec | null {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Live",
        className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
        title: "Live — adset is currently delivering ads",
      };
    case "PAUSED":
      return {
        label: "Paused",
        className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
        title: "Paused — manually paused at the adset level",
      };
    case "ADSET_PAUSED":
      return {
        label: "Paused",
        className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
        title: "Paused — the adset itself is paused",
      };
    case "CAMPAIGN_PAUSED":
      return {
        label: "Paused",
        className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
        title: "Paused — parent campaign is paused",
      };
    case "ARCHIVED":
      return {
        label: "Archived",
        className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
        title: "Archived — no longer in the active set",
      };
    case "DELETED":
      return {
        label: "Deleted",
        className: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
        title: "Deleted in Meta",
      };
    case "DISAPPROVED":
      return {
        label: "Disapproved",
        className: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
        title: "Disapproved by Meta — not delivering",
      };
    case "WITH_ISSUES":
      return {
        label: "Has issues",
        className: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
        title: "Delivery is limited by an issue (creative, account, payment, etc.)",
      };
    case "PENDING_REVIEW":
      return {
        label: "In review",
        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        title: "Pending Meta review",
      };
    case "IN_PROCESS":
      return {
        label: "Processing",
        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        title: "Being created/updated — not yet delivering",
      };
    case "PREAPPROVED":
      return {
        label: "Pre-approved",
        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        title: "Pre-approved by Meta — not yet delivering",
      };
    case "PENDING_BILLING_INFO":
      return {
        label: "Billing",
        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        title: "Awaiting billing info before delivery resumes",
      };
    case "UNKNOWN":
      return null;
  }
}

interface LearnPillSpec {
  label: string;
  className: string;
  title: string;
}

function learningSpec(status: LearningBucketUi): LearnPillSpec {
  switch (status) {
    case "Active":
      return {
        label: "Active",
        className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
        title: "Out of learning — Meta reports the adset has reached ~50 optimisation events in a 7-day window. Delivery is now stable.",
      };
    case "Learning":
      return {
        label: "Learning",
        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        title: "In learning phase — Meta is calibrating delivery. Needs ~50 optimisation events in a 7-day window to exit.",
      };
    case "LearningLimited":
      return {
        label: "Learning Limited",
        className: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
        title: "Learning limited — Meta cannot reach 50 optimisation events/week within the current budget. Often signals creative/audience fatigue or too-narrow targeting.",
      };
    case "Unknown":
      return {
        label: "Unknown",
        className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        title: "No learning data from Meta — typically because the adset is paused, very low-spend, or uses a non-standard optimisation goal.",
      };
  }
}

export function LiveStatusPill({ status }: { status: EffectiveStatusUi }) {
  const spec = liveSpec(status);
  if (!spec) return null;
  return (
    <span
      className={`px-1.5 py-px rounded-full text-[9px] font-semibold uppercase ${spec.className}`}
      title={spec.title}
    >
      {spec.label}
    </span>
  );
}

export function LearningStatusPill({ status }: { status: LearningBucketUi }) {
  const spec = learningSpec(status);
  return (
    <span
      className={`px-1.5 py-px rounded-full text-[9px] font-semibold uppercase ${spec.className} cursor-help`}
      title={spec.title}
    >
      {spec.label}
    </span>
  );
}
