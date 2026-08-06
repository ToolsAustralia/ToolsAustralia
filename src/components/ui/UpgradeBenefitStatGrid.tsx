"use client";

import React from "react";
import { Percent, Calendar, Sparkles } from "lucide-react";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
import { getPartnerAccessDurationLabel } from "@/utils/partner-discounts/partner-access-duration";

export type BenefitTier = "tradie" | "foreman" | "boss" | "neutral";

/** Tier accent map — the deep icon/label colour + translucent tints. Mirrors the tier theming used
 *  by the upgrade/payment modals so the grid looks identical in both steps of the upgrade flow.
 *
 *  `deep` reads on white; `accent` is the bright stop for dark surfaces (the same values the
 *  upgrade modal's `--tier-color` and UpgradeBenefitsPreview's TIER_THEME.accent use). Both are
 *  needed because the icon colour is applied as an INLINE style, which `dark:` cannot override —
 *  the value and label below it already carry proper dark arms, so the icons were the only
 *  thing left rendering dark-ink-on-near-black. */
const THEME: Record<BenefitTier, { deep: string; accent: string; iconBg: string; statBg: string; border: string }> = {
  tradie: { deep: "#0b7e88", accent: "#5ce0ff", iconBg: "rgba(0,194,237,0.18)", statBg: "rgba(0,194,237,0.06)", border: "rgba(0,194,237,0.42)" },
  foreman: { deep: "#a17b00", accent: "#ffe066", iconBg: "rgba(255,210,0,0.18)", statBg: "rgba(255,210,0,0.06)", border: "rgba(255,210,0,0.42)" },
  boss: { deep: "#b91c1c", accent: "#ff6b6b", iconBg: "rgba(238,0,0,0.18)", statBg: "rgba(238,0,0,0.06)", border: "rgba(238,0,0,0.40)" },
  neutral: { deep: "#b91c1c", accent: "#ff8080", iconBg: "rgba(220,38,38,0.14)", statBg: "rgba(220,38,38,0.05)", border: "rgba(220,38,38,0.35)" },
};

export function tierFromPackageName(name: string): BenefitTier {
  const l = (name || "").toLowerCase();
  if (l.includes("boss")) return "boss";
  if (l.includes("foreman")) return "foreman";
  if (l.includes("tradie")) return "tradie";
  return "neutral";
}

function Cell({
  icon,
  value,
  label,
  t,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  t: (typeof THEME)[BenefitTier];
}) {
  const isDark = useHtmlDarkForUi();
  return (
    <div className="rounded-xl border px-2 py-3 text-center" style={{ background: t.statBg, borderColor: t.border }}>
      <span
        className="mx-auto mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: t.iconBg, color: isDark ? t.accent : t.deep }}
      >
        {icon}
      </span>
      <div className="font-[Anton,Inter,sans-serif] text-[22px] leading-none text-neutral-900 dark:text-white">{value}</div>
      <div className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-400">{label}</div>
    </div>
  );
}

/**
 * The 3-cell membership benefit grid — **Partner offers % · Partner access · Free entries / cycle** —
 * shared by BOTH steps of the upgrade flow (`UpgradeConfirmModal/BenefitsBody` and
 * `StripePaymentModal/UpgradeBenefitsPreview`) so they show identical stats, labels, font, and visual.
 * Numbers must be the canonical tier values (partner-catalog % + the package's `entriesPerMonth`);
 * price is NOT a cell here — it lives in the order summary / checklist.
 */
export default function UpgradeBenefitStatGrid({
  tier,
  partnerPct,
  entriesPerCycle,
}: {
  tier: BenefitTier;
  partnerPct: number;
  entriesPerCycle: number;
}) {
  const t = THEME[tier];
  const access = getPartnerAccessDurationLabel({ isSubscription: true });
  return (
    <div className="grid grid-cols-3 gap-2">
      <Cell t={t} icon={<Percent size={18} />} value={`${partnerPct}%`} label="Partner offers" />
      <Cell t={t} icon={<Calendar size={18} />} value={access ? access.short : "While active"} label="Partner access" />
      <Cell t={t} icon={<Sparkles size={18} />} value={entriesPerCycle} label="Free entries / cycle" />
    </div>
  );
}
