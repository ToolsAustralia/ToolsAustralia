"use client";

import React from "react";
import { Sparkles, ArrowUp } from "lucide-react";

type Tier = "tradie" | "foreman" | "boss" | "neutral";

interface UpgradeBenefitsPreviewProps {
  /** Destination package — drives the headline and the highlighted accent. */
  toPackageName: string;
  /** Current package, when this is a tier change. Hidden when undefined (one-off). */
  fromPackageName?: string;
  /** Compact stat strip — show 2-3 cells max. */
  cells: Array<{ label: string; value: string | number }>;
}

function tierFromName(name: string): Tier {
  const lower = name.toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  if (lower.includes("tradie")) return "tradie";
  return "neutral";
}

/** Per-tier theme — accent (the bright glowing colour), deep (icon stroke in
 * light mode), translucent backgrounds, glow shadow. Mirrors the tier vars
 * defined in PackageDetailModal/styles.module.css. */
const TIER_THEME: Record<
  Tier,
  {
    accent: string; // bright tier color (badge/icon in dark, accent text)
    deep: string; // deep tier color (icon stroke in light)
    iconBg: string; // translucent tier bg for icon container
    border: string; // tier border colour
    glow: string; // outer glow colour
    cardBg: string; // wrapper card background tint
  }
> = {
  tradie: {
    accent: "#5ce0ff",
    deep: "#0b7e88",
    iconBg: "rgba(0,194,237,0.18)",
    border: "rgba(0,194,237,0.42)",
    glow: "rgba(0,194,237,0.34)",
    cardBg: "rgba(0,194,237,0.06)",
  },
  foreman: {
    accent: "#ffe066",
    deep: "#a17b00",
    iconBg: "rgba(255,210,0,0.18)",
    border: "rgba(255,210,0,0.42)",
    glow: "rgba(255,210,0,0.32)",
    cardBg: "rgba(255,210,0,0.06)",
  },
  boss: {
    accent: "#ff6b6b",
    deep: "#b91c1c",
    iconBg: "rgba(238,0,0,0.18)",
    border: "rgba(238,0,0,0.4)",
    glow: "rgba(238,0,0,0.34)",
    cardBg: "rgba(238,0,0,0.06)",
  },
  neutral: {
    accent: "#fca5a5",
    deep: "#b91c1c",
    iconBg: "rgba(220,38,38,0.14)",
    border: "rgba(220,38,38,0.35)",
    glow: "rgba(220,38,38,0.30)",
    cardBg: "rgba(220,38,38,0.05)",
  },
};

/**
 * Compact 2-3-cell benefit strip shown in StripePaymentModal so the user sees
 * exactly what they're paying FOR before they enter card details.
 *
 * Themed by the DESTINATION tier — Tradie → cyan, Foreman → yellow, Boss → red.
 * Icon container uses the same translucent-bg + glow pattern as the package
 * icon in PackageDetailModal hero.
 */
const UpgradeBenefitsPreview: React.FC<UpgradeBenefitsPreviewProps> = ({
  toPackageName,
  fromPackageName,
  cells,
}) => {
  const theme = TIER_THEME[tierFromName(toPackageName)];
  return (
    <div
      className="mb-3 rounded-2xl border bg-white dark:bg-neutral-900 px-3 py-3 shadow-sm"
      style={{
        borderColor: theme.border,
        backgroundImage: `linear-gradient(180deg, ${theme.cardBg}, transparent)`,
      }}
    >
      {/* Header row — tier-themed icon glow + accented destination tier name */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg flex-none"
          style={{
            background: theme.iconBg,
            border: `1px solid ${theme.border}`,
            boxShadow: `0 0 10px ${theme.glow}`,
            color: theme.deep,
          }}
        >
          <Sparkles className="h-3.5 w-3.5 dark:hidden" />
          <Sparkles
            className="h-3.5 w-3.5 hidden dark:block"
            style={{ color: theme.accent }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-extrabold tracking-[0.16em] uppercase"
            style={{ color: theme.deep }}
          >
            {fromPackageName ? "Upgrading to" : "You're getting"}
          </p>
          <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">
            {fromPackageName ? (
              <>
                <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                  {fromPackageName}
                </span>{" "}
                <ArrowUp
                  className="inline h-3 w-3"
                  style={{ color: theme.deep }}
                />{" "}
                <span style={{ color: theme.deep }} className="dark:!text-white">
                  {toPackageName}
                </span>
              </>
            ) : (
              <span style={{ color: theme.deep }} className="dark:!text-white">
                {toPackageName}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stat cells — tier-themed border + light tier tint background */}
      {cells.length > 0 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              className="text-center rounded-lg border bg-white dark:bg-neutral-800/60 px-2 py-2"
              style={{ borderColor: theme.border }}
            >
              <p className="font-acumin text-base leading-none text-neutral-900 dark:text-white">
                {c.value}
              </p>
              <p
                className="text-[9px] font-extrabold tracking-[0.12em] uppercase mt-1 leading-tight"
                style={{ color: theme.deep }}
              >
                {c.label}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UpgradeBenefitsPreview;
