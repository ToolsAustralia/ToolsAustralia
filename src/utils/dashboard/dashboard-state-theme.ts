/**
 * Dashboard hero theming by account state.
 *
 * Returns the header background gradient, readable ink, and accent color for
 * each of the five dashboard account states. Member (`active`) recolors to the
 * owned tier; the other four states use fixed palettes ported from the Claude
 * prototype (ConceptHub headers): teal (one-time), amber-brown (past-due),
 * slate-sky (retention-paused), neutral (guest/none).
 */
import { shade, inkOn, PAST_DUE_AMBER } from "@/utils/membership/tier-visuals";

export type DashboardAccountState = "active" | "onetime" | "pastdue" | "paused" | "none";

export interface DashboardStateTheme {
  /** CSS gradient for the hero header background. */
  gradient: string;
  /** Readable ink color on the gradient (white on dark, dark on gold/light). */
  ink: string;
  /** Accent color — tier color (active) / teal / amber / neutral. */
  accent: string;
}

// Fixed non-member header gradients (match the prototype ConceptHub headers).
const FIXED: Record<Exclude<DashboardAccountState, "active">, DashboardStateTheme> = {
  onetime: {
    gradient: "linear-gradient(157deg,#0f4d4d,#0a2e2e 56%,#124a52)",
    ink: "#ffffff",
    accent: "#0ea5a5",
  },
  pastdue: {
    gradient: "linear-gradient(157deg,#3a2410,#1c1410 55%,#2a1c10)",
    ink: "#ffffff",
    accent: PAST_DUE_AMBER,
  },
  // Retention-paused (freeze window): a calm, cool slate-sky — deliberately low-energy
  // (no red/amber alarm, no active-tier vibrancy) to read as "on hold, resuming soon".
  // Accent is the same sky the admin paused badge uses so the state feels consistent.
  paused: {
    gradient: "linear-gradient(157deg,#1e3a4d,#12212e 56%,#1a3340)",
    ink: "#ffffff",
    accent: "#38bdf8",
  },
  none: {
    gradient: "linear-gradient(157deg,#26262b,#161619 60%,#202027)",
    ink: "#ffffff",
    accent: "#737373",
  },
};

/**
 * Header background / ink / accent for the dashboard hero by account state.
 * For `active`, pass the owned tier hex; a rich 157deg tier gradient is derived
 * and ink is auto-picked for contrast (white on red/blue, dark on gold).
 */
export function getDashboardStateTheme(
  acct: DashboardAccountState,
  tierHex?: string | null,
): DashboardStateTheme {
  if (acct !== "active") return FIXED[acct];
  const hex = tierHex ?? "#ee0000";
  // A light/gold tier (Foreman #ffd200) is the only one `inkOn` renders with DARK
  // ink. The generic `shade()` darkened pure yellow to a dusty OLIVE mid-tone
  // (#947a00) — the "dirty" look. Fix ONLY that: a bright, vibrant gold that stays
  // true to the Foreman membership colour, dipping to a warm AMBER (not olive) for
  // depth. Dark ink is the natural, high-contrast pairing on bright gold (white
  // can't read on it), and the hero's dark decor/radial adds the metallic depth.
  if (inkOn(hex) === "#0a0a0a") {
    return { gradient: "linear-gradient(157deg, #ffd52b, #edb00a 56%, #ffcf1f)", ink: inkOn(hex), accent: hex };
  }
  const gradient = `linear-gradient(157deg, ${shade(hex, -8)}, ${shade(hex, -42)} 60%, ${shade(hex, -22)})`;
  return { gradient, ink: inkOn(hex), accent: hex };
}
