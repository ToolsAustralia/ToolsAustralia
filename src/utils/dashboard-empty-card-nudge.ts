/**
 * Per-tab session storage for the dashboard empty-state nudge animations.
 *
 * When a user lands on /my-account and the Membership or One-time entry card
 * is empty, the card animates to invite a click. After the user clicks the
 * card once in this tab, the nudge stops for the rest of the tab session.
 * Closing the tab or starting a fresh tab resets the flag and the nudge
 * re-appears, since each tab carries its own sessionStorage.
 *
 * Fails open (returns false / no-ops) when sessionStorage is unavailable
 * (private browsing edge cases). Worst case: animation always shows.
 */

const KEY_BASE = "ta:dashboard-card-nudge-clicked:v1";

export type NudgeCardType = "membership" | "onetime";

function key(cardType: NudgeCardType): string {
  return `${KEY_BASE}:${cardType}`;
}

export function hasClickedNudge(cardType: NudgeCardType): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(key(cardType)) === "1";
  } catch {
    return false;
  }
}

export function markNudgeClicked(cardType: NudgeCardType): void {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key(cardType), "1");
    }
  } catch {
    /* sessionStorage unavailable — silently ignore */
  }
}
