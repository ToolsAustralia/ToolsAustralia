import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";

type LooseEvent = {
  packageType?: string;
  eventType?: string;
  packageName?: string;
  packageId?: string;
  data?: Record<string, unknown>;
};

/**
 * Human-readable payment / billing kind for admin user detail.
 */
export function getAdminPaymentKindLabel(event: LooseEvent): string {
  if (event.eventType === "RefundPartial") {
    return "Partial refund (skipped)";
  }
  if (event.eventType === "RefundProcessed") {
    if (event.packageType === "membership") return "Refund";
    return "Refund processed";
  }
  if (event.eventType === "BenefitsReversed") return "Benefits reversed";

  const br = typeof event.data?.billingReason === "string" ? event.data.billingReason : undefined;

  switch (event.packageType) {
    case "membership": {
      if (br === "subscription_cycle") {
        return "Subscription renewal";
      }
      if (br === "subscription_create") return "Initial subscription";
      if (br === "subscription_update") return "Subscription update";
      if (br === "manual") return "Manual / admin";
      return "Membership";
    }
    case "one-time":
      return "One-time package";
    case "mini-draw":
      return "Mini draw purchase";
    case "upsell":
      return "Upsell add-on";
    default:
      return event.eventType || "Payment";
  }
}

/**
 * Best display name for a payment event (uses root packageName, data, then catalog lookup).
 */
export function resolveAdminPaymentEventTitle(event: LooseEvent): string {
  if (event.eventType === "RefundPartial") {
    return "Partial refund — benefits not reversed";
  }
  const fromRoot = typeof event.packageName === "string" && event.packageName.trim() ? event.packageName.trim() : "";
  if (fromRoot) return fromRoot;

  const data = event.data;
  const fromDataPkg =
    typeof data?.packageName === "string" && data.packageName.trim() ? data.packageName.trim() : "";
  if (fromDataPkg) return fromDataPkg;

  const fromOffer = typeof data?.offerTitle === "string" && data.offerTitle.trim() ? data.offerTitle.trim() : "";
  if (fromOffer) return fromOffer;

  const rawId = event.packageId ?? (typeof data?.packageId === "string" ? data.packageId : undefined);
  if (rawId) {
    const id = String(rawId);
    if (event.packageType === "mini-draw") {
      return getMiniDrawPackageById(id)?.name ?? id;
    }
    return getPackageById(id)?.name ?? id;
  }

  return "Package";
}
