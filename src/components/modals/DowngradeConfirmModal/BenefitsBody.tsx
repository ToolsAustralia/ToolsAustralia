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
  currentEntries?: number;
  saveLabel?: string;
  effectiveDateLabel?: string;
  fromPackageName: string;
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

/** A single stat cell inside the 3-column dc-stat-grid. */
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

/** A single item inside the dc-checks list.
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
 * BenefitsBody — the white body section under the dark Hero.
 *
 * Contains:
 * - Uppercase body title ("X benefits from your next billing date")
 * - 3-cell stat grid: Partner offers % · Days access · Free entries / cycle
 * - Checks list with conditional items for currentEntries, saveLabel, effectiveDateLabel
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
  saveLabel,
  effectiveDateLabel,
  fromPackageName,
}) => {
  return (
    <div className="bg-white dark:bg-neutral-950 px-[18px] pt-4 pb-3.5">
      {/* Body title — matches original: "{toPackageName} benefits from your next billing date" */}
      <div className="text-[11px] font-extrabold tracking-[0.16em] uppercase text-neutral-600 dark:text-neutral-400 text-center mb-3">
        {toPackageName} benefits from your next billing date
      </div>

      {/* Stat grid — 3 columns, gap 8px, mb 12px (matches original dc-stat-grid) */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* Cell 1: Partner offers % */}
        <StatCell
          icon={<Percent size={18} />}
          value={`${toPartnerAccessPercent}%`}
          label="Partner offers"
        />
        {/* Cell 2: Partner access — subscription downgrade, lifecycle-gated */}
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

      {/* Checks list — matches original dc-checks, mb-14px in original but omitted
       * here since actions button row sits outside this component */}
      <ul className="list-none p-0 m-0 grid gap-1.5">
        {/* Entries check — conditional on currentEntries > 0 */}
        {typeof currentEntries === "number" && currentEntries > 0 ? (
          <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
            Your <strong className="font-extrabold text-neutral-900 dark:text-white">{currentEntries.toLocaleString()}</strong> accumulated entries stay locked in
          </CheckItem>
        ) : (
          <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
            Every entry you&apos;ve earned stays locked in
          </CheckItem>
        )}

        {/* Current package benefits preserved until next billing */}
        <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
          Keep current {fromPackageName} benefits until next billing
        </CheckItem>

        {/* Savings — conditional */}
        {saveLabel ? (
          <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
            <strong className="font-extrabold text-neutral-900 dark:text-white">{saveLabel}</strong> from then on
          </CheckItem>
        ) : null}

        {/* Effective date — conditional */}
        {effectiveDateLabel ? (
          <CheckItem icon={<Check size={12} strokeWidth={2.5} />}>
            New plan activates <strong className="font-extrabold text-neutral-900 dark:text-white">{effectiveDateLabel}</strong>
          </CheckItem>
        ) : null}

        {/* No-refund notice — always shown, uses Tag icon (matches original) */}
        <CheckItem icon={<Tag size={12} strokeWidth={2.5} />}>
          No refund — you keep what you paid for
        </CheckItem>
      </ul>
    </div>
  );
};

export default BenefitsBody;
