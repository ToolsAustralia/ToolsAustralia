import type { DashboardAccountState } from "./dashboard-state-theme";

export interface DashboardAccountStateInput {
  /** `user.subscription?.isActive === true`. */
  hasActiveMembership: boolean;
  /** `hasFailedRenewal(user)` — a lapsed/failed renewal on the subscription. */
  isPastDue: boolean;
  /** `subscription.status === "paused"` — a retention-pause freeze window (`isActive` is false here).
   *  Optional: callers that don't distinguish a paused member (e.g. the partner-access ring, where a
   *  frozen member correctly resolves to `none`) may omit it — it then defaults to not-paused. */
  isPaused?: boolean;
  /** An active one-time pack (`getActivePackage(user).source === "one-time" && isActive`). */
  hasActiveOneTime: boolean;
}

/**
 * Resolve the dashboard account state from already-derived flags.
 *
 * Precedence: pastdue > paused > active > onetime > none. Past-due dominates
 * because a failed renewal pauses entries/claims regardless of any other holding,
 * and the hero must surface the recovery CTA above everything else. `paused` is
 * checked BEFORE the active/none arms because a frozen member has
 * `isActive === false` and would otherwise collapse to `none`.
 */
export function deriveDashboardAccountState(
  input: DashboardAccountStateInput,
): DashboardAccountState {
  if (input.isPastDue) return "pastdue";
  if (input.isPaused) return "paused";
  if (input.hasActiveMembership) return "active";
  if (input.hasActiveOneTime) return "onetime";
  return "none";
}
