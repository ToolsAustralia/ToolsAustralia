import type { DashboardAccountState } from "./dashboard-state-theme";

export interface DashboardAccountStateInput {
  /** `user.subscription?.isActive === true`. */
  hasActiveMembership: boolean;
  /** `hasFailedRenewal(user)` — a lapsed/failed renewal on the subscription. */
  isPastDue: boolean;
  /** An active one-time pack (`getActivePackage(user).source === "one-time" && isActive`). */
  hasActiveOneTime: boolean;
}

/**
 * Resolve the dashboard account state from already-derived flags.
 *
 * Precedence: pastdue > active > onetime > none. Past-due dominates because a
 * failed renewal pauses entries/claims regardless of any other holding, and the
 * hero must surface the recovery CTA above everything else.
 */
export function deriveDashboardAccountState(
  input: DashboardAccountStateInput,
): DashboardAccountState {
  if (input.isPastDue) return "pastdue";
  if (input.hasActiveMembership) return "active";
  if (input.hasActiveOneTime) return "onetime";
  return "none";
}
