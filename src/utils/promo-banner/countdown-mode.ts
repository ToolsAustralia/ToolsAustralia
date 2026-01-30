/**
 * Countdown display mode and formatting for promo banner.
 * Single place for "exactly 24h" rule and DAYS vs HRS MINS SECS logic.
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_24H = 24 * MS_PER_HOUR;
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

export type CountdownDisplayType =
  | "hidden"
  | "limited_time_only"
  | "ending"
  | "draw_tonight"
  | "draw_tomorrow"
  | "midnight"
  | "scheduled_end";

export interface ResolveCountdownDisplayResult {
  type: CountdownDisplayType;
  endMs?: number;
  useDays?: boolean;
}

export interface ResolveCountdownDisplayParams {
  countdownMode: "default" | "limited_time_only" | "scheduled_end" | "ending";
  showCountdown: boolean;
  source: "scheduled" | "toggle" | "alternating" | "none";
  scheduledEndDate?: string | null;
  durationMs?: number | null;
  drawStatus: "today" | "tomorrow" | null;
}

/**
 * Resolves what to show in the countdown slot: hidden, "LIMITED TIME ONLY", "ENDING", draw countdown, or scheduled end countdown.
 * Component uses result.type and, for scheduled_end, endMs + useDays to drive display.
 */
export function resolveCountdownDisplay(params: ResolveCountdownDisplayParams): ResolveCountdownDisplayResult {
  const { countdownMode, showCountdown, source, scheduledEndDate, durationMs, drawStatus } = params;

  if (!showCountdown) {
    return { type: "hidden" };
  }

  const now = Date.now();
  const endMs = scheduledEndDate ? new Date(scheduledEndDate).getTime() : undefined;
  const timeLeftMs = endMs != null ? endMs - now : undefined;

  if (countdownMode === "limited_time_only") {
    const is24h = isScheduledDuration24h(durationMs ?? undefined);
    if (source === "scheduled" && is24h && timeLeftMs != null && timeLeftMs > 0) {
      return { type: "scheduled_end", endMs: endMs!, useDays: false };
    }
    return { type: "limited_time_only" };
  }

  if (countdownMode === "ending") {
    const is24h = isScheduledDuration24h(durationMs ?? undefined);
    if (source === "scheduled" && is24h && timeLeftMs != null && timeLeftMs > 0) {
      return { type: "scheduled_end", endMs: endMs!, useDays: false };
    }
    return { type: "ending" };
  }

  if (countdownMode === "scheduled_end" && source === "scheduled" && timeLeftMs != null && timeLeftMs > 0) {
    return {
      type: "scheduled_end",
      endMs: endMs!,
      useDays: timeLeftMs > MS_24H,
    };
  }

  if (drawStatus === "today") return { type: "draw_tonight" };
  if (drawStatus === "tomorrow") return { type: "draw_tomorrow" };
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
