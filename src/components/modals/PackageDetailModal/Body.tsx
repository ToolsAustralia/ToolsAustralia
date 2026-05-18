"use client";

import React from "react";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";
import { Check, Ticket, Sparkles, Calendar, Handshake, Percent } from "lucide-react";
import { getPartnerAccessDurationLabel } from "@/utils/partner-discounts/partner-access-duration";

interface BodyProps {
  packageName: string;
  isSubscription: boolean;
  entriesPerMonth: number;
  totalEntries: number;
  partnerDays: number;
  /** Partner catalog access % — Tradie 50, Foreman 75, Boss 100 (subs);
   * VIP 100, Power 85, Boss 70, Foreman 55, Tradie 40, Apprentice 25 (one-time). */
  partnerAccessPercent: number;
  features: string[];
  hasAccumulatedEntriesFeature: boolean;
  showSubscriptionEntriesPerMonthRow: boolean;
  accumulation: { entriesPerMonth: number; lastMonthAccumulatedEntries: number } | null | undefined;
  showChart: boolean;
  chartPackageId: string;
}

/** e.g. "15 Free Accumulated Entries Major Giveaway" — shown as ticket row */
function isAccumulatedEntriesMarketingFeature(text: string): boolean {
  return /\d+\s*free\s+accumulated\s+entries/i.test(String(text));
}

/** Compact stat cell rendered inline in the headline strip.
 * Dark mode uses opaque neutral-900 surface (NOT a white-tinted gradient) so
 * labels stay legible — light text on a dark surface, never light on light. */
const StatCell: React.FC<{ icon: React.ReactNode; value: string | number; label: string }> = ({
  icon,
  value,
  label,
}) => (
  <div className="text-center px-1.5 py-2 rounded-lg border bg-gradient-to-b from-white to-neutral-50 dark:from-neutral-900 dark:to-neutral-950 border-neutral-200 dark:border-neutral-800">
    <div
      className="w-7 h-7 mx-auto mb-1 rounded-md inline-flex items-center justify-center"
      style={{
        background: "var(--tier-icon-bg)",
        border: "1px solid var(--tier-border)",
        color: "var(--tier-icon-fg)",
        boxShadow: "0 0 10px var(--tier-glow-1)",
      }}
    >
      {icon}
    </div>
    <div className="font-acumin text-base leading-none text-neutral-900 dark:text-white">{value}</div>
    <div className="text-[8px] font-extrabold tracking-[0.1em] uppercase text-neutral-600 dark:text-neutral-300 mt-0.5 leading-tight">
      {label}
    </div>
  </div>
);

const Body: React.FC<BodyProps> = ({
  packageName,
  isSubscription,
  entriesPerMonth,
  totalEntries,
  partnerDays,
  partnerAccessPercent,
  features,
  showSubscriptionEntriesPerMonthRow,
  accumulation,
  showChart,
  chartPackageId,
}) => {
  /** 3-cell infographic strip — same order/labels used by UpgradeConfirm
   * BenefitsBody and MembershipSection: Partner offers % → Days access →
   * Free entries / cycle. */
  const statCells: Array<{ icon: React.ReactNode; value: string | number; label: string }> = [];
  if (partnerAccessPercent > 0) {
    statCells.push({
      icon: <Percent size={14} strokeWidth={2.2} />,
      value: `${partnerAccessPercent}%`,
      label: "Partner offers",
    });
  }
  if (isSubscription) {
    const durationLabel = getPartnerAccessDurationLabel({ isSubscription: true });
    if (durationLabel) {
      statCells.push({
        icon: <Calendar size={14} strokeWidth={2.2} />,
        value: durationLabel.short,
        label: "Partner access",
      });
    }
  } else if (partnerDays > 0) {
    statCells.push({
      icon: <Calendar size={14} strokeWidth={2.2} />,
      value: partnerDays,
      label: "Days access",
    });
  }
  if (isSubscription) {
    statCells.push({
      icon: <Sparkles size={14} strokeWidth={2.2} />,
      value: entriesPerMonth.toLocaleString(),
      label: "Free entries / cycle",
    });
  } else if (totalEntries > 0) {
    statCells.push({
      icon: <Sparkles size={14} strokeWidth={2.2} />,
      value: totalEntries.toLocaleString(),
      label: "Free entries",
    });
  }

  return (
    <div className="bg-white dark:bg-neutral-950 px-[18px] pt-3 pb-3 space-y-3">
      {/* Stat strip — infographic summary of what the user gets */}
      {statCells.length > 0 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${statCells.length}, minmax(0, 1fr))` }}
        >
          {statCells.map((cell, i) => (
            <StatCell key={i} icon={cell.icon} value={cell.value} label={cell.label} />
          ))}
        </div>
      )}

      {/* Chart — renders at native size; modal scrolls if it overflows. */}
      {showChart && (
        <VerticalAccumulationChart
          selectedPackageId={chartPackageId}
          showOnlySelectedPackage
          userAccumulation={
            accumulation
              ? {
                  baseEntriesPerMonth: accumulation.entriesPerMonth,
                  lastMonthAccumulatedEntries: accumulation.lastMonthAccumulatedEntries,
                }
              : undefined
          }
        />
      )}

      {/* Billing note (subscription only) */}
      {isSubscription && (
        <div className="rounded-lg border border-amber-400/60 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-amber-900 dark:text-amber-200 text-[11px] font-semibold leading-snug">
            Joined on the{" "}
            <strong className="text-amber-700 dark:text-amber-300">25th–27th</strong>?
            You&apos;ll be billed on the{" "}
            <strong className="text-amber-700 dark:text-amber-300">24th next month</strong>.
          </p>
        </div>
      )}

      {/* One-time entries are now shown in the stat strip above; redundant
       * paragraph removed. */}

      {/* Included benefits — tier-themed list with iconified rows.
       * Restored partner-days + entries-per-month rows alongside marketing
       * features, since the stat strip is a quick glance and this list is the
       * full inclusion breakdown. */}
      <div
        className="rounded-xl border px-3 py-2.5 bg-gradient-to-b from-white to-neutral-50 dark:from-neutral-900 dark:to-neutral-950 border-neutral-200 dark:border-neutral-800"
      >
        <h4 className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-neutral-600 dark:text-neutral-300 mb-1.5">
          Included benefits
        </h4>
        <ul className="list-none p-0 m-0 grid gap-1.5">
          {features.map((feature, i) => {
            const useTicketIcon = isSubscription && isAccumulatedEntriesMarketingFeature(feature);
            const Icon = useTicketIcon ? Ticket : Check;
            return (
              <li
                key={i}
                className="flex items-start gap-2.5 text-xs text-neutral-800 dark:text-neutral-100 leading-[1.45] font-medium"
              >
                <span
                  className="flex-none w-5 h-5 rounded-md inline-flex items-center justify-center mt-px"
                  style={{
                    background: "var(--tier-icon-bg)",
                    border: "1px solid var(--tier-border)",
                    color: "var(--tier-icon-fg)",
                    boxShadow: "0 0 8px var(--tier-glow-1)",
                  }}
                >
                  <Icon size={11} strokeWidth={2.6} />
                </span>
                <span>{feature}</span>
              </li>
            );
          })}
          {(isSubscription || partnerDays > 0) && (
            <li className="flex items-center gap-2.5 text-xs text-neutral-800 dark:text-neutral-100 leading-[1.45] font-medium">
              <span
                className="flex-none w-5 h-5 rounded-md inline-flex items-center justify-center"
                style={{
                  background: "var(--tier-icon-bg)",
                  border: "1px solid var(--tier-border)",
                  color: "var(--tier-icon-fg)",
                  boxShadow: "0 0 8px var(--tier-glow-1)",
                }}
              >
                <Handshake size={11} strokeWidth={2.6} />
              </span>
              <span>
                {isSubscription ? (
                  getPartnerAccessDurationLabel({ isSubscription: true })!.long
                ) : (
                  <>
                    Partner discounts for{" "}
                    <strong className="font-extrabold">{partnerDays} days</strong>
                  </>
                )}
              </span>
            </li>
          )}
          {showSubscriptionEntriesPerMonthRow && (
            <li className="flex items-center gap-2.5 text-xs text-neutral-800 dark:text-neutral-100 leading-[1.45] font-medium">
              <span
                className="flex-none w-5 h-5 rounded-md inline-flex items-center justify-center"
                style={{
                  background: "var(--tier-icon-bg)",
                  border: "1px solid var(--tier-border)",
                  color: "var(--tier-icon-fg)",
                  boxShadow: "0 0 8px var(--tier-glow-1)",
                }}
              >
                <Ticket size={11} strokeWidth={2.6} />
              </span>
              <span>
                <strong className="font-extrabold">{entriesPerMonth.toLocaleString()}</strong>{" "}
                free entries per month (membership)
              </span>
            </li>
          )}
          {!isSubscription && totalEntries > 0 && (
            <li className="flex items-center gap-2.5 text-xs text-neutral-800 dark:text-neutral-100 leading-[1.45] font-medium">
              <span
                className="flex-none w-5 h-5 rounded-md inline-flex items-center justify-center"
                style={{
                  background: "var(--tier-icon-bg)",
                  border: "1px solid var(--tier-border)",
                  color: "var(--tier-icon-fg)",
                  boxShadow: "0 0 8px var(--tier-glow-1)",
                }}
              >
                <Ticket size={11} strokeWidth={2.6} />
              </span>
              <span>
                <strong className="font-extrabold">{totalEntries.toLocaleString()}</strong>{" "}
                free entries (one-time)
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Body;
