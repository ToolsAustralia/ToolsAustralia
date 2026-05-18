"use client";

import React from "react";
import { Check, Calendar, Tag, Percent, Sparkles } from "lucide-react";
import { getPartnerAccessDurationLabel } from "@/utils/partner-discounts/partner-access-duration";

interface BenefitsBodyProps {
  toPackageName: string;
  toPartnerAccessPercent: number;
  /** Retained for caller compatibility; not rendered — subscription partner
   * access is lifecycle-gated (shown as "While active"), not a day count. */
  toPartnerDiscountDays: number;
  toEntriesPerMonth: number;
  /** Current accumulated entries (for "before → after" display). */
  currentEntries?: number;
  /** Entries granted IMMEDIATELY when the upgrade is charged. The flow:
   * user pays today → entries are added to their balance today → next renewal
   * cycle adds another `toEntriesPerMonth` on top. */
  upgradeEntriesGrant?: number;
  /** Optional display label for when the new plan activates (typically "today" for upgrades). */
  effectiveDateLabel?: string;
  fromPackageName: string;
  toPackagePrice: number;
}

/** Icon wrapper shared by all stat cells.
 * Uses var(--tier-icon-bg-light) as background and var(--tier-color-deep)
 * as icon colour — both are set on the outer [data-tier] frame by styles.module.css.
 */
const StatIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="w-8 h-8 rounded-lg mx-auto mb-1.5 inline-flex items-center justify-center"
    style={{
      background: "var(--tier-icon-bg-light)",
      color: "var(--tier-color-deep)",
    }}
  >
    {children}
  </div>
);

/** A single stat cell inside the 3-column stat grid. */
const StatCell: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
}> = ({ icon, value, label }) => (
  <div
    className="text-center px-2 py-3 rounded-xl border"
    style={{
      background: "var(--tier-stat-bg)",
      borderColor: "var(--tier-stat-border)",
    }}
  >
    <StatIcon>{icon}</StatIcon>
    {/* Original CSS: font-family Anton/Inter, 22px, color #0a0a0a (not tier-colored). */}
    <div
      className="font-[Anton,Inter,sans-serif] text-[22px] leading-none text-neutral-900 dark:text-white"
    >
      {value}
    </div>
    <div className="text-[9px] font-extrabold tracking-[0.12em] uppercase text-neutral-600 dark:text-neutral-400 mt-1">
      {label}
    </div>
  </div>
);

/** A single item inside the checks list.
 * SVG icon colour is set via inline style (mirrors original's :global(svg) selector).
 */
const CheckItem: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, children }) => (
  <li className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200 leading-[1.35]">
    <span
      className="flex-none"
      style={{ color: "var(--tier-color-deep)" }}
    >
      {icon}
    </span>
    {children}
  </li>
);

/**
 * BenefitsBody — the white body section under the dark Hero for upgrades.
 *
 * Contains:
 * - Uppercase body title ("{toPackageName} activates today")
 * - 3-cell stat grid: Partner offers % · Days access · Free entries / cycle
 * - Checks list with upgrade-specific copy (entries grant, immediate activation, price callout)
 *
 * Stat order matches MembershipSection: partner access % → days of access → entries.
 * All tier-themed CSS custom properties (--tier-stat-bg, --tier-stat-border,
 * --tier-icon-bg-light, --tier-color-deep) cascade down from the [data-tier] frame
 * set by Shell.tsx.
 */
const BenefitsBody: React.FC<BenefitsBodyProps> = ({
  toPackageName,
  toPartnerAccessPercent,
  // toPartnerDiscountDays intentionally not destructured: subscription partner
  // access is lifecycle-gated, so we no longer render a day count here.
  toEntriesPerMonth,
  currentEntries,
  upgradeEntriesGrant,
  fromPackageName,
  toPackagePrice,
}) => {
  const hasEntriesGrant =
    typeof upgradeEntriesGrant === "number" && upgradeEntriesGrant > 0;
  const hasCurrentEntries =
    typeof currentEntries === "number" && currentEntries >= 0;

  /** Entries the user will be sitting on right after this upgrade is charged. */
  const entriesAfterUpgrade =
    hasCurrentEntries && hasEntriesGrant
      ? currentEntries! + upgradeEntriesGrant!
      : null;

  /** Projected accumulated entries after the NEXT renewal cycle, assuming the
   * user stays on the new plan: today's balance + another month of new tier
   * entries. Mirrors how `calculateRenewalEntries` works at next bill. */
  const entriesAtNextBill =
    entriesAfterUpgrade !== null && toEntriesPerMonth > 0
      ? entriesAfterUpgrade + toEntriesPerMonth
      : null;

  return (
    <div className="bg-white dark:bg-neutral-950 px-[18px] pt-4 pb-3.5">
      {/* Body title */}
      <div className="text-[11px] font-extrabold tracking-[0.16em] uppercase text-neutral-600 dark:text-neutral-400 text-center mb-3">
        {toPackageName} activates today
      </div>

      {/* Stat grid — 3 columns, gap 8px, mb 12px */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* Cell 1: Partner offers % */}
        <StatCell
          icon={<Percent size={18} />}
          value={`${toPartnerAccessPercent}%`}
          label="Partner offers"
        />
        {/* Cell 2: Partner access — subscription upgrade, lifecycle-gated */}
        <StatCell
          icon={<Calendar size={18} />}
          value={getPartnerAccessDurationLabel({ isSubscription: true })!.short}
          label="Partner access"
        />
        {/* Cell 3: Free entries / cycle */}
        <StatCell
          icon={<Sparkles size={18} />}
          value={toEntriesPerMonth}
          label="Free entries / cycle"
        />
      </div>

      {/* Checks list */}
      <ul className="list-none p-0 m-0 grid gap-1.5">
        {/* Immediate entries grant — added to balance the moment payment clears */}
        {hasEntriesGrant && hasCurrentEntries ? (
          <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
            <strong className="text-green-600">
              +{upgradeEntriesGrant!.toLocaleString()}
            </strong>{" "}
            entries added today
            {entriesAfterUpgrade !== null && (
              <>
                {" "}({currentEntries!.toLocaleString()} →{" "}
                <strong className="font-extrabold text-neutral-900 dark:text-white">
                  {entriesAfterUpgrade.toLocaleString()}
                </strong>
                )
              </>
            )}
          </CheckItem>
        ) : hasEntriesGrant ? (
          <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
            <strong className="text-green-600">
              +{upgradeEntriesGrant!.toLocaleString()}
            </strong>{" "}
            entries added today
          </CheckItem>
        ) : null}

        {/* Next-bill projection — what they'll accumulate at next renewal */}
        {entriesAtNextBill !== null && (
          <CheckItem icon={<Sparkles size={12} strokeWidth={2.5} />}>
            Next bill, you&apos;ll be at{" "}
            <strong className="font-extrabold text-neutral-900 dark:text-white">
              {entriesAtNextBill.toLocaleString()}
            </strong>{" "}
            accumulated entries
          </CheckItem>
        )}

        {/* New plan benefits start now */}
        <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
          {toPackageName} benefits start now
        </CheckItem>

        {/* Price callout — charged today */}
        <CheckItem icon={<Tag size={12} strokeWidth={2.5} />}>
          <strong className="font-extrabold text-neutral-900 dark:text-white">
            Charged ${toPackagePrice} today
          </strong>
        </CheckItem>

        {/* Cancel anytime — always shown */}
        <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
          Cancel anytime
        </CheckItem>
      </ul>
    </div>
  );
};

export default BenefitsBody;
