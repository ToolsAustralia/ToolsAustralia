/**
 * Membership Streak — pure display derivations for the dashboard card.
 * Design of record: claudeDesign/Membership milestone streak design (Build Kit).
 *
 * The streak accent inherits the member's package colour (tierHex); the default
 * is TEMPERED STEEL — deliberately not orange/amber, which would collide with
 * past-due/warning semantics. Values are verbatim from the Build Kit.
 */
import type { TierKey } from "@/utils/membership/tier-visuals";

export type StreakAccentVars = Record<
  "--s-core" | "--s-hi" | "--s-b" | "--s-em" | "--s-ring" | "--s-sh" | "--s-glow",
  string
>;

/** Default / no-tier fallback = tempered steel. */
export const STREAK_STEEL_VARS: StreakAccentVars = {
  "--s-core": "#f4f6f9",
  "--s-hi": "#c9d2dd",
  "--s-b": "#78828f",
  "--s-em": "#39414d",
  "--s-ring": "#a7b1bd",
  "--s-sh": "rgba(28,34,43,.5)",
  "--s-glow": "rgba(120,132,148,.5)",
};

/** Per-tier accents (Build Kit `.pkg-*` themes, keyed by the app's TierKey). */
export const STREAK_TIER_VARS: Record<TierKey, StreakAccentVars> = {
  tradie: {
    "--s-core": "#e8fbff",
    "--s-hi": "#5fdcff",
    "--s-b": "#00a0c6",
    "--s-em": "#064b5e",
    "--s-ring": "#22c8ed",
    "--s-sh": "rgba(6,55,70,.55)",
    "--s-glow": "rgba(34,200,237,.55)",
  },
  foreman: {
    "--s-core": "#fffbe6",
    "--s-hi": "#ffe14d",
    "--s-b": "#dba300",
    "--s-em": "#7a5800",
    "--s-ring": "#ffd200",
    "--s-sh": "rgba(80,58,0,.5)",
    "--s-glow": "rgba(255,205,0,.55)",
  },
  boss: {
    "--s-core": "#ffecec",
    "--s-hi": "#ff6161",
    "--s-b": "#c40000",
    "--s-em": "#6b0000",
    "--s-ring": "#ee0000",
    "--s-sh": "rgba(85,0,0,.5)",
    "--s-glow": "rgba(238,40,40,.5)",
  },
};

export function streakAccentVars(tierKey: TierKey | null | undefined): StreakAccentVars {
  return tierKey ? STREAK_TIER_VARS[tierKey] : STREAK_STEEL_VARS;
}

export type StreakCardState = "fresh" | "active" | "atrisk" | "paused" | "founding";

/** Card state per the Build Kit table (paused is prop-driven — no live pause signal in the payload yet). */
export function deriveStreakCardState(
  acct: "active" | "onetime" | "pastdue" | "none",
  streakMonths: number,
  paused = false
): StreakCardState | null {
  if (acct !== "active" && acct !== "pastdue") return null;
  if (paused) return "paused";
  if (acct === "pastdue") return "atrisk";
  if (streakMonths >= 12) return "founding";
  if (streakMonths <= 0) return "fresh";
  return "active";
}

export interface StreakCycleFuse {
  /** 1-based day within the billing cycle. */
  day: number;
  totalDays: number;
  /** 0–1 fill for the fuse bar. */
  fx: number;
  /** e.g. "24 Aug" (en-AU). */
  renewsLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Billing-cycle fuse from the REAL renewal date (subscription.endDate — already
 * trialing-safe and autoRenew-gated upstream in useDashboardState). Cycle start
 * is one month before the renewal.
 */
export function deriveStreakCycleFuse(renewalDateIso: string | null, now: Date = new Date()): StreakCycleFuse | null {
  if (!renewalDateIso) return null;
  const end = new Date(renewalDateIso);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  // Month-end overflow guard: a 29–31st renewal minus one month can overflow
  // (31 Mar → "31 Feb" → 3 Mar); clamp to the last day of the intended month.
  if (start.getDate() !== end.getDate()) start.setDate(0);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const elapsed = Math.round((now.getTime() - start.getTime()) / DAY_MS);
  const day = Math.min(Math.max(elapsed + 1, 1), totalDays);
  return {
    day,
    totalDays,
    fx: Math.min(Math.max(day / totalDays, 0), 1),
    renewsLabel: end.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
  };
}
