"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { X, CreditCard, Sparkles, Calendar, Percent } from "lucide-react";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getPartnerAccessDurationLabel } from "@/utils/partner-discounts/partner-access-duration";
import { cn } from "@/utils/cn";

export interface SubscriptionExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  entriesPerMonth: number;
  packageName?: string;
  lastMonthAccumulatedEntries: number;
  selectedPackageId?: string;
}

type Tier = "tradie" | "foreman" | "boss" | "neutral";

function tierFromName(name?: string): Tier {
  const lower = (name || "").toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  if (lower.includes("tradie")) return "tradie";
  return "neutral";
}

const TIER_VARS: Record<Tier, React.CSSProperties> = {
  tradie: {
    ["--tier-color" as string]: "#5ce0ff",
    ["--tier-color-deep" as string]: "#0b7e88",
    ["--tier-glow-1" as string]: "rgba(0,194,237,0.34)",
    ["--tier-glow-2" as string]: "rgba(92,169,236,0.18)",
    ["--tier-card-bg" as string]: "rgba(0,194,237,0.14)",
    ["--tier-border" as string]: "rgba(0,194,237,0.42)",
    ["--tier-icon-bg" as string]: "rgba(0,194,237,0.18)",
    ["--tier-icon-bg-light" as string]: "#e0f9ff",
    ["--tier-stat-bg" as string]: "linear-gradient(180deg, #f0fbff, #fff)",
    ["--tier-stat-border" as string]: "#bae6fd",
    ["--tier-cta-bg" as string]: "linear-gradient(135deg, #5ca9ec, #00c2ed)",
    ["--tier-cta-text" as string]: "#fff",
    ["--tier-cta-shadow" as string]: "0 8px 18px rgba(0,194,237,0.42)",
  },
  foreman: {
    ["--tier-color" as string]: "#ffe066",
    ["--tier-color-deep" as string]: "#a17b00",
    ["--tier-glow-1" as string]: "rgba(255,210,0,0.32)",
    ["--tier-glow-2" as string]: "rgba(255,210,0,0.16)",
    ["--tier-card-bg" as string]: "rgba(255,210,0,0.14)",
    ["--tier-border" as string]: "rgba(255,210,0,0.45)",
    ["--tier-icon-bg" as string]: "rgba(255,210,0,0.2)",
    ["--tier-icon-bg-light" as string]: "#fffbe6",
    ["--tier-stat-bg" as string]: "linear-gradient(180deg, #fffce6, #fff)",
    ["--tier-stat-border" as string]: "#fde68a",
    ["--tier-cta-bg" as string]: "linear-gradient(135deg, #ffe066, #ffd200)",
    ["--tier-cta-text" as string]: "#0a0a0a",
    ["--tier-cta-shadow" as string]: "0 8px 18px rgba(255,210,0,0.45)",
  },
  boss: {
    ["--tier-color" as string]: "#ff6b6b",
    ["--tier-color-deep" as string]: "#b91c1c",
    ["--tier-glow-1" as string]: "rgba(238,0,0,0.34)",
    ["--tier-glow-2" as string]: "rgba(238,0,0,0.16)",
    ["--tier-card-bg" as string]: "rgba(238,0,0,0.14)",
    ["--tier-border" as string]: "rgba(238,0,0,0.4)",
    ["--tier-icon-bg" as string]: "rgba(238,0,0,0.18)",
    ["--tier-icon-bg-light" as string]: "#fef2f2",
    ["--tier-stat-bg" as string]: "linear-gradient(180deg, #fff5f5, #fff)",
    ["--tier-stat-border" as string]: "#fee2e2",
    ["--tier-cta-bg" as string]: "linear-gradient(135deg, #ff3333, #ee0000)",
    ["--tier-cta-text" as string]: "#fff",
    ["--tier-cta-shadow" as string]: "0 8px 18px rgba(238,0,0,0.42)",
  },
  neutral: {
    ["--tier-color" as string]: "#fca5a5",
    ["--tier-color-deep" as string]: "#b91c1c",
    ["--tier-glow-1" as string]: "rgba(220,38,38,0.30)",
    ["--tier-glow-2" as string]: "rgba(220,38,38,0.14)",
    ["--tier-card-bg" as string]: "rgba(220,38,38,0.10)",
    ["--tier-border" as string]: "rgba(220,38,38,0.35)",
    ["--tier-icon-bg" as string]: "rgba(220,38,38,0.14)",
    ["--tier-icon-bg-light" as string]: "#fef2f2",
    ["--tier-stat-bg" as string]: "linear-gradient(180deg, #fff5f5, #fff)",
    ["--tier-stat-border" as string]: "#fecaca",
    ["--tier-cta-bg" as string]: "linear-gradient(135deg, #ef4444, #dc2626)",
    ["--tier-cta-text" as string]: "#fff",
    ["--tier-cta-shadow" as string]: "0 8px 18px rgba(220,38,38,0.35)",
  },
};

/** Compact stat cell — mirrors PackageDetailModal/Body StatCell. Dark-aware.
 * Icon container uses tier-themed glow (translucent tier bg + tier border +
 * outer glow) so it matches the package icon in the hero. Icon stroke colour
 * is the deep tone in light mode, bright tone in dark mode. */
const StatCell: React.FC<{ icon: React.ReactNode; value: string | number; label: string }> = ({
  icon,
  value,
  label,
}) => (
  <div className="text-center px-1.5 py-2 rounded-lg border bg-gradient-to-b from-white to-neutral-50 dark:from-neutral-900 dark:to-neutral-950 border-neutral-200 dark:border-neutral-800">
    <div
      className="w-7 h-7 mx-auto mb-1 rounded-md inline-flex items-center justify-center text-[color:var(--tier-color-deep)] dark:text-[color:var(--tier-color)]"
      style={{
        background: "var(--tier-icon-bg)",
        border: "1px solid var(--tier-border)",
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

/**
 * One-time-per-account modal explaining how membership entries work.
 * Mirrors the PackageDetailModal design language: tier-themed dark hero with
 * package icon next to headline, infographic stat strip, accumulation chart,
 * billing note, and "Got it" CTA.
 */
const SubscriptionExplainerModal: React.FC<SubscriptionExplainerModalProps> = ({
  isOpen,
  onClose,
  entriesPerMonth,
  packageName,
  lastMonthAccumulatedEntries,
  selectedPackageId,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tier: Tier = tierFromName(packageName);
  const icon: PackageIconData | null = packageName
    ? getPackageIconByName(packageName, "subscription")
    : null;

  /** Partner catalog access % — same source the rest of the site uses
   * (Tradie 50, Foreman 75, Boss 100 for subscriptions). This is always a SUBSCRIPTION
   * explainer, so the fallback appends `-subscription` to the tier (a bare "Foreman"
   * would wrongly resolve to the one-time ladder's 55%). Matches PackageDetailModal,
   * UpgradeConfirm BenefitsBody, and MembershipSection. */
  const partnerAccessPercent = getPartnerCatalogAccessPercentForPlanId(
    selectedPackageId ?? (tier !== "neutral" ? `${tier}-subscription` : "")
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ zIndex: 90 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} aria-hidden />

      {/* Stage */}
      <div
        className="relative w-full max-w-[520px] font-sans text-neutral-950 antialiased max-h-[82dvh] flex max-xs:max-h-[88dvh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sem-headline"
      >
        {/* Close */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-[30px] h-[30px] rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-colors duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
        >
          <X size={14} strokeWidth={2} />
        </button>

        {/* Frame — tier vars set via inline style */}
        <div
          style={TIER_VARS[tier]}
          className={cn(
            "relative rounded-[20px] bg-white dark:bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.2)] w-full max-h-full overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] max-xs:rounded-2xl"
          )}
        >
          {/* Hero */}
          <div
            className="relative px-[18px] pt-4 pb-[16px] text-white overflow-hidden"
            style={{
              background:
                "radial-gradient(700px 280px at 50% -80px, var(--tier-glow-1), transparent 65%), radial-gradient(500px 220px at 50% 120%, var(--tier-glow-2), transparent 60%), linear-gradient(180deg, #0a0a0a 0%, #141416 60%, #0a0a0a 100%)",
            }}
          >
            <div className="relative z-[2]">
              {/* Eyebrow */}
              <div
                className="inline-flex items-center gap-1.5 px-[10px] py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border mb-2.5"
                style={{
                  color: "var(--tier-color)",
                  borderColor: "var(--tier-border)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                }}
              >
                <CreditCard size={12} />
                <span>How it works</span>
              </div>

              {/* Headline + sub-copy share a row to the right of the icon —
               * 2 tight rows to match PackageDetailModal hero layout. */}
              <div className="flex items-center gap-3">
                {icon && (
                  <div
                    className="w-12 h-12 rounded-[12px] inline-flex items-center justify-center p-1 flex-none overflow-hidden max-xs:w-10 max-xs:h-10"
                    style={{
                      backgroundColor: "var(--tier-icon-bg)",
                      border: "1.5px solid var(--tier-border)",
                      boxShadow: "0 4px 14px var(--tier-glow-1)",
                    }}
                  >
                    <Image
                      src={icon}
                      alt={packageName ?? "Membership"}
                      width={56}
                      height={56}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      sizes="56px"
                    />
                  </div>
                )}
                <div className="min-w-0 flex flex-col gap-0.5">
                  <h2
                    id="sem-headline"
                    className="relative font-acumin text-[26px] leading-none tracking-[0.005em] uppercase m-0 max-xs:text-[22px]"
                  >
                    <span className="font-extrabold" style={{ color: "var(--tier-color)" }}>
                      {packageName ?? "Membership"}
                    </span>
                  </h2>
                  <p
                    className="relative text-[11px] leading-[1.3] max-w-[360px] max-xs:text-[10px]"
                    style={{ color: "rgba(255,255,255,0.65)" }}
                  >
                    Here&apos;s how your monthly entries stack up over time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="bg-white dark:bg-neutral-950 px-[18px] pt-3 pb-3 space-y-3">
            {/* Stat strip — same canonical 3-cell pattern as UpgradeConfirm
             * BenefitsBody and PackageDetailModal: Partner offers % →
             * Days access → Free entries / cycle. */}
            <div className="grid gap-2 grid-cols-3">
              <StatCell
                icon={<Percent size={14} strokeWidth={2.2} />}
                value={`${partnerAccessPercent}%`}
                label="Partner offers"
              />
              <StatCell
                icon={<Calendar size={14} strokeWidth={2.2} />}
                value={getPartnerAccessDurationLabel({ isSubscription: true })!.short}
                label="Partner access"
              />
              <StatCell
                icon={<Sparkles size={14} strokeWidth={2.2} />}
                value={entriesPerMonth.toLocaleString()}
                label="Free entries / cycle"
              />
            </div>

            {/* Chart — renders at native size; modal scrolls if it overflows. */}
            {selectedPackageId && (
              <VerticalAccumulationChart
                selectedPackageId={selectedPackageId}
                showOnlySelectedPackage
                userAccumulation={{
                  baseEntriesPerMonth: entriesPerMonth,
                  lastMonthAccumulatedEntries,
                }}
              />
            )}

            {/* Billing note — compact */}
            <div className="rounded-lg border border-amber-400/60 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <p className="text-amber-900 dark:text-amber-200 text-[11px] font-semibold leading-snug">
                Joined on the{" "}
                <strong className="text-amber-700 dark:text-amber-300">25th–27th</strong>?
                You&apos;ll be billed on the{" "}
                <strong className="text-amber-700 dark:text-amber-300">24th next month</strong>.
              </p>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold text-sm tracking-[0.01em] uppercase border-0 transition hover:brightness-105 hover:-translate-y-px"
              style={{
                background: "var(--tier-cta-bg)",
                color: "var(--tier-cta-text)",
                boxShadow: "var(--tier-cta-shadow)",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionExplainerModal;
