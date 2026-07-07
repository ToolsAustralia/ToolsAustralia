"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMemberships } from "@/hooks/useMemberships";
import { getOneTimePackages as getStaticOneTimePackages } from "@/data/membershipPackages";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { useUserContext } from "@/contexts/UserContext";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import {
  convertToLocalPlan,
  getPackageId,
  type LocalMembershipPlan,
} from "@/utils/membership/membership-adapters";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { buildCheckoutResumeUrl } from "@/utils/integrations/klaviyo/checkout-resume-url";
import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { selectOneTimeDrawerPackages } from "@/utils/membership/additional-package-mapping";

export type MembershipTab = "membership" | "one-time";

/** Returns the same plan with promo-multiplied monthly/total entries on metadata. */
function applyPromo(plan: LocalMembershipPlan, multiplier: number): LocalMembershipPlan {
  if (multiplier <= 1) return plan;
  const base = plan.metadata?.entriesCount ?? 0;
  return {
    ...plan,
    metadata: {
      ...plan.metadata,
      entriesCount: base * multiplier,
      originalEntries: base,
      promoMultiplier: multiplier,
      isPromoActive: true,
    },
  };
}

const isSubscriptionPlan = (p: LocalMembershipPlan) =>
  p.period !== "one-time" && !p.name.toLowerCase().includes("one-time");

/**
 * The conversion-section brain for the redesigned /membership page. Ports
 * MembershipSection's CTA state machine (label / lock / routing / Klaviyo)
 * verbatim so the new tier + pack cards behave identically without touching
 * the shared MembershipSection. Cards just call `onSelect(plan)`.
 *
 * NOTE: this intentionally mirrors logic in MembershipSection.tsx. The two could
 * later be unified into this hook; kept separate here to honour "recompose only"
 * (no edits to the shared MembershipSection used across 15+ pages).
 */
export function useMembershipCardCta(
  {
    includeAdditionalForMembers = false,
  }: {
    includeAdditionalForMembers?: boolean;
  } = {},
) {
  const router = useRouter();
  const pathname = usePathname();
  const { userData, isAuthenticated, loading: userLoading } = useUserContext();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const membershipModal = useMembershipModal();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const { trackKlaviyoStartedCheckout } = useKlaviyoTracking();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);

  const membershipMultiplier = useResolvedMultiplier("membership-packages") ?? 1;
  const oneTimeMultiplier = useResolvedMultiplier("one-time-packages") ?? 1;

  const hasActiveSubscription = userData?.subscription?.isActive || false;
  const isPastDue = userData?.subscription?.status === "past_due";
  const hasBlockingSub = hasBlockingSubscription(userData);
  const hasAccessToAdditional = hasAdditionalPackageAccess(userData, userMajorDrawStats);
  const currentPrice = userData?.subscriptionPackageData?.price ?? 0;
  const currentName = (userData?.subscriptionPackageData?.name ?? "").toLowerCase();

  const [activeTab, setActiveTab] = useState<MembershipTab>(
    hasActiveSubscription && hasAccessToAdditional ? "one-time" : "membership",
  );

  const membershipPlans = useMemo(
    () => subscriptionPackages.map(convertToLocalPlan).map((p) => applyPromo(p, membershipMultiplier)),
    [subscriptionPackages, membershipMultiplier],
  );

  // Partner-discount window (days) lives on the static source, not the mapped
  // MembershipPlan — carry it onto card metadata by package name.
  const daysByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of getStaticOneTimePackages()) {
      if (p.partnerDiscountDays != null) m.set(p.name, p.partnerDiscountDays);
    }
    return m;
  }, []);

  // The public /membership "Not subscribing?" section always shows the PUBLIC
  // one-time ladder (Apprentice→VIP) — the member-only "Additional" packs are a
  // my-account concept, not part of this marketing cross-sell.
  // When `includeAdditionalForMembers` is on (my-account membership page), members
  // see the Additional packs instead — matching the shared MembershipSection offer.
  const oneTimePlans = useMemo(() => {
    return selectOneTimeDrawerPackages(oneTimePackages, {
      hasAdditionalAccess: hasAccessToAdditional,
      includeAdditional: includeAdditionalForMembers,
    }).map((raw) => {
      const local = convertToLocalPlan(raw);
      const days = daysByName.get(raw.name);
      const withDays =
        days != null ? { ...local, metadata: { ...local.metadata, partnerDiscountDays: days } } : local;
      return applyPromo(withDays, oneTimeMultiplier);
    });
  }, [oneTimePackages, oneTimeMultiplier, daysByName, hasAccessToAdditional, includeAdditionalForMembers]);

  const hierarchy = (p: LocalMembershipPlan) => {
    if (!hasActiveSubscription || !currentName || !isSubscriptionPlan(p)) {
      return { isCurrent: false, isUpgrade: false, isDowngrade: false };
    }
    return {
      isCurrent: p.name.toLowerCase() === currentName,
      isUpgrade: p.price > currentPrice,
      isDowngrade: p.price < currentPrice,
    };
  };

  const ctaLabelFor = (p: LocalMembershipPlan): string => {
    if (hasBlockingSub && isPastDue && isSubscriptionPlan(p)) return "Update payment";
    if (hasActiveSubscription && isSubscriptionPlan(p)) {
      const h = hierarchy(p);
      if (h.isCurrent) return "Current Plan";
      if (h.isDowngrade) return `Downgrade to ${getPackageDisplayName(p)}`;
      if (h.isUpgrade) return `Upgrade to ${getPackageDisplayName(p)}`;
    }
    // No "Pro" tier exists — never surface the data's "Go Pro" buttonText for subs.
    return isSubscriptionPlan(p) ? `Choose ${getPackageDisplayName(p)}` : p.buttonText || "Enter Now";
  };

  const isLocked = (p: LocalMembershipPlan): boolean =>
    !hasAccessToAdditional && !!p.isAdditional;

  const onSelect = (plan: LocalMembershipPlan) =>
    whenGatesOpenElseGateModal(() => {
      const h = hierarchy(plan);
      // A past-due member can't start a new SUBSCRIPTION (must resolve/switch first → /my-account),
      // but CAN still buy a ONE-TIME / Additional pack (it's a standalone purchase, not a second
      // subscription — the "Get more entries" flow already allows this). So only bounce subscription
      // taps; let one-time/Additional pack taps open the purchase modal.
      if (hasBlockingSub && isPastDue && isSubscriptionPlan(plan)) {
        router.push("/my-account");
        return;
      }
      // existing subscribers managing their plan → /my-account
      if (hasActiveSubscription && (h.isDowngrade || h.isUpgrade || h.isCurrent)) {
        router.push("/my-account");
        return;
      }
      // new subscription / one-time / guest → open the existing modal
      membershipModal.openModal(plan);

      // Canonical Klaviyo "Started Checkout" — AUTHED users only (guests fire
      // server-side from /api/auth/register). Mirrors MembershipSection exactly.
      if (isAuthenticated && !userLoading) {
        try {
          const apiPackageId = getPackageId(plan, [...subscriptionPackages, ...oneTimePackages]);
          if (apiPackageId) {
            let promoSlug: string | undefined;
            try {
              const match = pathname?.match(/^\/promotions\/([^/?#]+)/);
              if (match && match[1]) promoSlug = match[1];
            } catch {
              // Non-blocking
            }
            const checkoutUrl = buildCheckoutResumeUrl({
              baseUrl: window.location.origin,
              packageId: apiPackageId,
              promoSlug,
            });
            trackKlaviyoStartedCheckout({
              package_id: apiPackageId,
              package_name: plan.name,
              package_type: plan.period === "mo" ? "membership" : "one-time",
              tier: plan.name.toLowerCase(),
              price: plan.price,
              checkout_url: checkoutUrl,
              ...(promoSlug ? { promo_slug: promoSlug } : {}),
              is_authenticated: true,
            });
          }
        } catch {
          // Non-blocking — never fail the CTA on a tracking error
        }
      }
    });

  return {
    activeTab,
    setActiveTab,
    membershipPlans,
    oneTimePlans,
    ctaLabelFor,
    isLocked,
    onSelect,
    membershipModal,
  };
}

export type MembershipCardCta = ReturnType<typeof useMembershipCardCta>;
