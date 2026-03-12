import type { IPromoLink } from "@/models/PromoLink";

export type PromoEligibilityReason =
  | "eligible"
  | "audience_mismatch"
  | "requires_inactive_subscription"
  | "missing_cancelled_at"
  | "cancelled_window_exceeded";

export interface PromoEligibilityResult {
  eligible: boolean;
  reason: PromoEligibilityReason;
}

interface UserSubscriptionSnapshot {
  cancelledAt?: Date;
  isActive?: boolean;
  status?: string;
}

interface UserEligibilitySnapshot {
  subscription?: UserSubscriptionSnapshot;
}

const CANCELLED_STATUSES = new Set(["canceled", "cancelled"]);

function hasCancellationSignal(user: UserEligibilitySnapshot): boolean {
  const subscription = user.subscription;
  if (!subscription) return false;

  if (subscription.cancelledAt instanceof Date) {
    return true;
  }

  const normalizedStatus = subscription.status?.toLowerCase().trim();
  if (normalizedStatus && CANCELLED_STATUSES.has(normalizedStatus)) {
    return true;
  }

  return false;
}

export class PromoEligibilityService {
  static evaluateAudienceEligibility(
    promoLink: IPromoLink,
    user: UserEligibilitySnapshot
  ): PromoEligibilityResult {
    if (promoLink.eligibilityAudience === "all") {
      return { eligible: true, reason: "eligible" };
    }

    if (promoLink.eligibilityAudience !== "cancelled-members") {
      return { eligible: false, reason: "audience_mismatch" };
    }

    if (!hasCancellationSignal(user)) {
      return { eligible: false, reason: "audience_mismatch" };
    }

    const requireInactive = promoLink.eligibilityRules?.requireInactiveSubscription === true;
    if (requireInactive && user.subscription?.isActive === true) {
      return { eligible: false, reason: "requires_inactive_subscription" };
    }

    const cancelledWithinDays = promoLink.eligibilityRules?.cancelledWithinDays;
    if (cancelledWithinDays) {
      const cancelledAt = user.subscription?.cancelledAt;
      if (!(cancelledAt instanceof Date)) {
        return { eligible: false, reason: "missing_cancelled_at" };
      }

      const ageMs = Date.now() - cancelledAt.getTime();
      const allowedMs = cancelledWithinDays * 24 * 60 * 60 * 1000;
      if (ageMs > allowedMs) {
        return { eligible: false, reason: "cancelled_window_exceeded" };
      }
    }

    return { eligible: true, reason: "eligible" };
  }
}
