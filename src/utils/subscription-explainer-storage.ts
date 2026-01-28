/**
 * localStorage helpers for one-time-per-account subscription explainer modal.
 * Key: subscriptionExplainerSeen_${userId}
 */

export const hasSeenExplainer = (userId: string): boolean =>
  typeof window !== "undefined" && !!localStorage.getItem(`subscriptionExplainerSeen_${userId}`);

export const markExplainerSeen = (userId: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(`subscriptionExplainerSeen_${userId}`, "true");
  }
};
