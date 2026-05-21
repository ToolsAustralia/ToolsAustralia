/**
 * localStorage helpers for one-time-per-account rewards widget spotlight.
 * Key: rewardsWidgetSpotlightSeen_${userId}
 */

export const hasSeenRewardsSpotlight = (userId: string): boolean =>
  typeof window !== "undefined" && !!localStorage.getItem(`rewardsWidgetSpotlightSeen_${userId}`);

export const markRewardsSpotlightSeen = (userId: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(`rewardsWidgetSpotlightSeen_${userId}`, "true");
  }
};
