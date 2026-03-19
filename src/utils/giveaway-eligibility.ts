/**
 * Giveaway eligibility utilities
 * Centralized logic for SA/ACT and under-18 ineligibility
 */

const INADMISSIBLE_STATES = ["SA", "ACT"] as const;
const MIN_AGE = 18;

/**
 * Check if the user is ineligible for giveaways based on state or age.
 * - SA and ACT residents cannot participate in giveaways
 * - Users under 18 cannot participate in giveaways
 * @param state - Australian state/territory code (e.g. "NSW", "SA")
 * @param birthdate - ISO date string or Date (date of birth)
 * @returns true if user is ineligible (cannot participate in giveaways)
 */
export function isGiveawayIneligible(state?: string, birthdate?: string | Date | null): boolean {
  const reasons = getGiveawayIneligibilityReasons(state, birthdate);
  return reasons.state === true || reasons.under18 === true;
}

/**
 * Returns which field(s) cause giveaway ineligibility so the UI can highlight them.
 * @param state - Australian state/territory code (e.g. "NSW", "SA")
 * @param birthdate - ISO date string or Date (date of birth)
 * @returns { state: true } if SA/ACT, { under18: true } if under 18, or both
 */
export function getGiveawayIneligibilityReasons(
  state?: string,
  birthdate?: string | Date | null
): { state?: boolean; under18?: boolean } {
  const reasons: { state?: boolean; under18?: boolean } = {};

  if (state && INADMISSIBLE_STATES.includes(state.toUpperCase() as (typeof INADMISSIBLE_STATES)[number])) {
    reasons.state = true;
  }

  if (birthdate) {
    const dob = typeof birthdate === "string" ? new Date(birthdate) : birthdate;
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age -= 1;
      }
      if (age < MIN_AGE) reasons.under18 = true;
    }
  }

  return reasons;
}
