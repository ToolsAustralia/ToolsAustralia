"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";

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

// ---------- Learning phase popover (Meta-style) ----------

const POPOVER_WIDTH = 360;
const POPOVER_PAD = 12;

function clampPopover(rect: DOMRect): { top: number; left: number; width: number } {
  if (typeof window === "undefined") return { top: 0, left: 0, width: POPOVER_WIDTH };
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_PAD * 2);
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + width > window.innerWidth - POPOVER_PAD) left = window.innerWidth - POPOVER_PAD - width;
  if (left < POPOVER_PAD) left = POPOVER_PAD;
  const estHeight = 280;
  if (top + estHeight > window.innerHeight - POPOVER_PAD) {
    top = Math.max(POPOVER_PAD, rect.top - estHeight - 4);
  }
  return { top, left, width };
}

interface LearningPopoverContent {
  title: string;
  body: string;
  duration: string | null;
  barClass: string;
  showBar: boolean;
}

function popoverContent(status: LearningBucketUi): LearningPopoverContent {
  switch (status) {
    case "Active":
      return {
        title: "Learning phase complete",
        body: "This ad set has exited learning. Delivery is now stable — Meta is no longer recalibrating. Making a significant edit (audience, optimisation event, creative) will reset learning.",
        duration: null,
        barClass: "bg-emerald-500",
        showBar: true,
      };
    case "Learning":
      return {
        title: "Learning phase progress",
        body: "Your ads are being delivered, but Meta is learning how to best deliver them. You may see changes in performance and higher costs during this time. Since performance is still stabilising, avoid editing your ad set during the learning phase.",
        duration: "This process could take up to 7 days.",
        barClass: "bg-amber-500",
        showBar: true,
      };
    case "LearningLimited":
      return {
        title: "Learning Limited",
        body: "Meta couldn't reach 50 optimisation events per week with this configuration, so the ad set has stopped learning. Common causes: budget too low for the target CPA, audience too narrow, or creative fatigue. Consider consolidating ad sets, broadening the audience, or raising the budget.",
        duration: null,
        barClass: "bg-red-500",
        showBar: true,
      };
    case "Unknown":
      return {
        title: "Learning data unavailable",
        body: "Meta is not exposing learning state for this ad set right now. This usually happens for long-stable ad sets that exited learning weeks ago, ad sets that are paused, or ones using a non-standard optimisation goal.",
        duration: null,
        barClass: "bg-zinc-400",
        showBar: false,
      };
  }
}

interface PopoverProps {
  status: LearningBucketUi;
  conversionsSinceLastSignificantEdit: number | null | undefined;
  daysSinceLastSignificantEdit: number | null | undefined;
  lastSignificantEdit: string | null | undefined;
  createdTime: string | null | undefined;
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function formatMetaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LearningStatusPopover({
  status,
  conversionsSinceLastSignificantEdit,
  daysSinceLastSignificantEdit,
  lastSignificantEdit,
  createdTime,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: PopoverProps) {
  if (typeof document === "undefined") return null;
  const { top, left, width } = clampPopover(anchorRect);
  const content = popoverContent(status);
  const conv = conversionsSinceLastSignificantEdit;
  const hasProgress = typeof conv === "number" && conv >= 0;
  const fillPct = hasProgress ? Math.min(100, (conv! / 50) * 100) : 0;
  // "Since..." line always renders when we have progress data. Prefers the
  // real edit timestamp; falls back to adset creation when Meta returns no
  // edit history (matches Meta's UI behaviour); shows a no-anchor message
  // as final fallback so the line never silently disappears.
  const anchorLabel: string | null = (() => {
    if (lastSignificantEdit) return `Since last significant edit (${formatMetaDate(lastSignificantEdit)})`;
    if (createdTime) return `Never edited · Created ${formatMetaDate(createdTime)}`;
    return "Edit history not available from Meta";
  })();

  return createPortal(
    <div
      className="z-[9999] fixed"
      style={{ top, left, width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl text-xs [overflow-wrap:anywhere]">
        <div className="px-3 py-2.5">
          <div className="font-bold text-[13px] text-zinc-900 dark:text-zinc-100 mb-2">{content.title}</div>
          {content.showBar && (
            <div className="mb-1.5">
              <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div className={`h-full ${content.barClass} transition-all`} style={{ width: `${fillPct}%` }} />
              </div>
            </div>
          )}
          {hasProgress && (
            <>
              <div className="text-zinc-800 dark:text-zinc-100 text-[12px]">
                Website purchases: <span className="font-semibold">{conv} / 50</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                {anchorLabel}
                {typeof daysSinceLastSignificantEdit === "number" && daysSinceLastSignificantEdit >= 0 && (
                  <> · {daysSinceLastSignificantEdit}d ago</>
                )}
              </div>
            </>
          )}
        </div>
        <div className="px-3 pb-2.5 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
          {content.body}
        </div>
        {content.duration && (
          <div className="px-3 pb-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
              Expected duration
            </div>
            <div className="text-[11px] text-zinc-700 dark:text-zinc-300">{content.duration}</div>
          </div>
        )}
        <a
          href="https://www.facebook.com/business/help/112167992830700"
          target="_blank"
          rel="noopener noreferrer"
          className="block px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-b-md inline-flex items-center gap-1"
        >
          <span>Learn more</span>
          <ExternalLink size={10} aria-hidden />
        </a>
      </div>
    </div>,
    document.body,
  );
}

export function LearningStatusPill({
  status,
  conversionsSinceLastSignificantEdit,
  daysSinceLastSignificantEdit,
  lastSignificantEdit,
  createdTime,
}: {
  status: LearningBucketUi;
  conversionsSinceLastSignificantEdit?: number | null;
  daysSinceLastSignificantEdit?: number | null;
  lastSignificantEdit?: string | null;
  createdTime?: string | null;
}) {
  const spec = learningSpec(status);
  const [hover, setHover] = useState<{ rect: DOMRect } | null>(null);
  // Grace-period close timer — same pattern as the verdict tooltip so the
  // cursor can move from trigger pill onto popover body without the popover
  // vanishing mid-hop.
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeRef.current) clearTimeout(closeRef.current); }, []);
  const open = (rect: DOMRect) => {
    if (closeRef.current) { clearTimeout(closeRef.current); closeRef.current = null; }
    setHover({ rect });
  };
  const scheduleClose = () => {
    if (closeRef.current) clearTimeout(closeRef.current);
    closeRef.current = setTimeout(() => setHover(null), 120);
  };
  const cancelClose = () => {
    if (closeRef.current) { clearTimeout(closeRef.current); closeRef.current = null; }
  };
  return (
    <>
      <span
        className={`px-1.5 py-px rounded-full text-[9px] font-semibold uppercase ${spec.className} cursor-help`}
        onMouseEnter={(e) => open(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={scheduleClose}
      >
        {spec.label}
      </span>
      {hover && (
        <LearningStatusPopover
          status={status}
          conversionsSinceLastSignificantEdit={conversionsSinceLastSignificantEdit}
          daysSinceLastSignificantEdit={daysSinceLastSignificantEdit}
          lastSignificantEdit={lastSignificantEdit}
          createdTime={createdTime}
          anchorRect={hover.rect}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </>
  );
}
