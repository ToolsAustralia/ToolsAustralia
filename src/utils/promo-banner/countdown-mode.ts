/**
 * Countdown display mode and formatting for promo banner.
 * Single place for "exactly 24h" rule and DAYS vs HRS MINS SECS logic.
 */

const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_24H = 24 * MS_PER_HOUR;
/** Within 1 hour of 24h counts as "exactly 24h" for limited_time_only/ending and format choice */
const TOLERANCE_MS = MS_PER_HOUR;

/**
 * True when scheduled promo duration is effectively 24 hours (within 1 hour).
 * Used for limited_time_only/ending (show countdown only when 24h) and scheduled_end (use HRS MINS SECS when ≤24h).
 */
export function isScheduledDuration24h(durationMs: number | undefined): boolean {
  if (durationMs == null || durationMs < 0) return false;
  const diff = Math.abs(durationMs - MS_24H);
  return diff <= TOLERANCE_MS;
}

/** Preset labels for static urgency mode - used in admin UI only */
export const STATIC_URGENCY_LABEL_PRESETS = ["LIMITED TIME ONLY", "PROMO ENDING", "ENDING SOON"] as const;

export type CountdownDisplayType =
  | "hidden"
  | "static_urgency"
  | "draw_tonight"
  | "midnight"
  | "scheduled_end";

export interface ResolveCountdownDisplayResult {
  type: CountdownDisplayType;
  /** Label text when type is static_urgency */
  label?: string;
  endMs?: number;
  useDays?: boolean;
}

/** Valid countdown modes for variant banner config - shared with Variant model */
export type CountdownMode = "default" | "limited_time_only" | "scheduled_end" | "ending" | "static_urgency";

export interface ResolveCountdownDisplayParams {
  countdownMode: CountdownMode;
  showCountdown: boolean;
  source: "scheduled" | "toggle" | "alternating" | "derived-from-membership" | "none";
  scheduledEndDate?: string | null;
  durationMs?: number | null;
  drawStatus: "today" | "tomorrow" | null;
  /** Admin-configured label for static_urgency mode; optional override for legacy modes */
  countdownLabel?: string | null;
}

/** Default labels for legacy countdown modes (used when countdownLabel not provided) */
const LEGACY_MODE_DEFAULTS: Record<string, string> = {
  limited_time_only: "LIMITED TIME ONLY",
  ending: "PROMO ENDING",
  static_urgency: "ENDING SOON",
};

/**
 * Resolves what to show in the countdown slot: hidden, static label, draw countdown, or scheduled end countdown.
 * Component uses result.type and, for static_urgency, result.label. For scheduled_end, endMs + useDays drive display.
 */
export function resolveCountdownDisplay(params: ResolveCountdownDisplayParams): ResolveCountdownDisplayResult {
  const { countdownMode, showCountdown, source, scheduledEndDate, drawStatus, countdownLabel } = params;

  if (!showCountdown) {
    return { type: "hidden" };
  }

  // Draw today: countdown to freeze. Draw tomorrow is no longer a special case (falls through like other days).
  if (drawStatus === "today") return { type: "draw_tonight" };

  const now = Date.now();
  const endMs = scheduledEndDate ? new Date(scheduledEndDate).getTime() : undefined;
  const timeLeftMs = endMs != null ? endMs - now : undefined;

  // Static urgency modes: default = 24hr countdown to next midnight AEST (refreshes every midnight)
  // Skip scheduled_end; show midnight countdown instead of static label (PROMO ENDING) or promo-end countdown
  const staticUrgencyModes: CountdownMode[] = ["limited_time_only", "ending", "static_urgency"];
  if (staticUrgencyModes.includes(countdownMode)) {
    if (source === "scheduled" && timeLeftMs != null && timeLeftMs > 0) {
      return { type: "midnight" };
    }
    const label =
      (countdownLabel?.trim() && countdownLabel.trim()) ||
      LEGACY_MODE_DEFAULTS[countdownMode] ||
      "ENDING SOON";
    return { type: "static_urgency", label };
  }

  if (countdownMode === "scheduled_end" && source === "scheduled" && timeLeftMs != null && timeLeftMs > 0) {
    return {
      type: "scheduled_end",
      endMs: endMs!,
      useDays: timeLeftMs > MS_24H,
    };
  }

  return { type: "midnight" };
}

export interface FormattedTimeLeft {
  days?: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Format milliseconds into display units. When useDays is true, includes days and omits seconds for long countdowns.
 */
export function formatTimeLeft(ms: number, useDays: boolean): FormattedTimeLeft {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  if (useDays) {
    return { days, hours, minutes, seconds };
  }
  return { hours: days * 24 + hours, minutes, seconds };
}
