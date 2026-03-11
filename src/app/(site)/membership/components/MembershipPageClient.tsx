"use client";

import { useEffect } from "react";
import Image from "next/image";
import MetallicButton from "@/components/ui/MetallicButton";
import MetallicDivider from "@/components/ui/MetallicDivider";
import BrandScroller from "@/components/ui/BrandScroller";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import PartnerBenefitsPromoSectionClient from "@/components/sections/promo/PartnerBenefitsPromoSectionClient";
import { hasActivePartnerDiscountAccess } from "@/utils/membership/benefit-resolution";
import { derivePlanIdFromPackage, getLandingPageThemeFromPlanId } from "@/utils/package-colors/packageColorScheme";
import MembershipSection from "@/components/sections/MembershipSection";
import MembershipPackagesChart from "@/components/sections/MembershipPackagesChart";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useUserContext } from "@/contexts/UserContext";
import { SectionContainer } from "@/components/ui";
import MembershipModal from "@/components/modals/MembershipModal";
import { useMemberships } from "@/hooks/useMemberships";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";

export default function MembershipPageClient() {
  // Use the unified hook for consistent package selection across all entry points
  const { openEntryFlow } = useMajorDrawEntryCta();
  const membershipModal = useMembershipModal();
  const { userData } = useUserContext();
  const hasActiveSubscription = userData?.subscription?.isActive === true;
  // Check if user has active partner discount access (handles null/undefined userData)
  // Type assertion needed because UserData is a simplified type, but function handles missing fields gracefully
  const hasPartnerDiscountAccess = hasActivePartnerDiscountAccess(
    (userData as unknown as import("@/models/User").IUser) ?? null
  );

  // Package theme when user has partner discount access
  let packageTheme: ReturnType<typeof getLandingPageThemeFromPlanId> | undefined;
  if (hasPartnerDiscountAccess && userData) {
    if (userData.subscription?.isActive && userData.subscriptionPackageData) {
      const planId = derivePlanIdFromPackage(userData.subscriptionPackageData, "subscription");
      packageTheme = getLandingPageThemeFromPlanId(planId, true);
    } else if (userData.enrichedOneTimePackages?.length) {
      const queue = (userData as { partnerDiscountQueue?: Array<{ packageId: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
      const activeIds = new Set(
        queue
          .filter((i) => i.status === "active" && ["one-time", "mini-draw", "upsell"].includes(i.packageType))
          .map((i) => String(i.packageId))
      );
      const pkg = userData.enrichedOneTimePackages
        .filter((p) => p.isActive && p.packageData && activeIds.has(String(p.packageId)))
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
      if (pkg?.packageData) {
        const planId = derivePlanIdFromPackage(pkg.packageData, "one-time");
        packageTheme = getLandingPageThemeFromPlanId(planId, false);
      }
    }
  }

  const { subscriptionPackages } = useMemberships();
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const membershipPromoMultiplier = resolvedMembershipMultiplier ?? 1;

  // Helper function to get Tradie subscription package for non-subscribers
  const getTradiePackage = (): LocalMembershipPlan => {
    const targetPackageId = "tradie-subscription";
    const packageData = subscriptionPackages.find((pkg) => pkg.id === targetPackageId);

    if (!packageData) {
      // Fallback if package not found
      const baseEntries = 15; // Tradie subscription has 15 entries per month
      const promoEntries = baseEntries * membershipPromoMultiplier;

      return {
        id: targetPackageId,
        name: "Tradie",
        price: 20,
        period: "mo",
        features: [
          {
            text: `${promoEntries} Free Accumulated Entries${
              membershipPromoMultiplier > 1 ? ` (${membershipPromoMultiplier}X PROMO!)` : ""
            }`,
          },
          { text: "100% Access to Partner Discounts" },
          { text: "Mini Draws" },
        ],
        buttonText: "Get Started",
        buttonStyle: "secondary",
        isMemberOnly: false,
        metadata: {
          entriesCount: promoEntries,
          promoMultiplier: membershipPromoMultiplier,
          originalEntries: baseEntries,
          isPromoActive: membershipPromoMultiplier > 1,
        },
      };
    }

    const localPlan = convertToLocalPlan(packageData);

    // Apply promo multiplier if active
    if (membershipPromoMultiplier <= 1) {
      return localPlan;
    }

    const originalEntries = localPlan.metadata?.entriesCount ?? 0;
    const promoEntries = originalEntries * membershipPromoMultiplier;

    return {
      ...localPlan,
      features: localPlan.features.map((feature) => {
        if (feature.text.toLowerCase().includes("entries")) {
          return {
            ...feature,
            text: feature.text.replace(/\d+/, promoEntries.toString()),
          };
        }
        return feature;
      }),
      metadata: {
        ...localPlan.metadata,
        entriesCount: promoEntries,
        originalEntries,
        promoMultiplier: membershipPromoMultiplier,
        isPromoActive: true,
      },
    };
  };

  // Scroll to #membership on load/hash change
  useEffect(() => {
    const handleScrollToMembership = () => {
      if (window.location.hash === "#membership") {
        const scrollToSection = () => {
          const membershipSection = document.getElementById("membership");
          if (membershipSection) {
            const header = document.querySelector("header");
            const headerHeight = header ? (header as HTMLElement).offsetHeight : 80;
            const elementPosition = membershipSection.offsetTop - headerHeight - 20;
            window.scrollTo({ top: Math.max(0, elementPosition), behavior: "smooth" });
          }
        };
        requestAnimationFrame(() => setTimeout(scrollToSection, 100));
      }
    };
    const initialTimeout = setTimeout(handleScrollToMembership, 300);
    window.addEventListener("hashchange", handleScrollToMembership);
    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener("hashchange", handleScrollToMembership);
    };
  }, []);

  return (
    <>
      {/* Hero + brand scroller */}
      <section className="relative pt-[86px] sm:pt-[106px] pb-12 bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden min-h-[100svh]">
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/background/memebership.webp"
            alt="Tools Australia Membership"
            fill
            className="object-cover opacity-20"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/30" />
        </div>
        <div className="relative z-10 w-full px-4 sm:px-0">
          <div className="py-10 sm:py-14 text-center">
            <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-['Poppins'] mb-4">
              <span className="text-white">U</span>
              <span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">n</span>
              <span className="text-white">lock Exclusive</span>
              <br />
              <span className="text-white">M</span>
              <span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">e</span>
              <span className="text-white">mbership Benefits</span>
            </h1>
            <p className="text-[16px] text-gray-200 mb-4 font-['Poppins']">
              Join thousands of members enjoying exclusive perks, special discounts, and access to members-only deals.
              Start your journey to better savings today!
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-xl mx-auto">
              <MetallicButton
                variant="primary"
                size="md"
                borderRadius="lg"
                className="w-full sm:w-auto text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3"
                onClick={() => {
                  if (!hasActiveSubscription) {
                    // Get Tradie package directly (for non-subscribers, regardless of entries)
                    const tradiePlan = getTradiePackage();
                    membershipModal.setSelectedPlan(tradiePlan);
                    membershipModal.openModal();
                  } else {
                    // User has subscription - show additional packages
                    openEntryFlow({ openLocalModal: false });
                  }
                }}
              >
                Join Now!
              </MetallicButton>
              <MetallicButton
                href="#membership"
                variant="secondary"
                size="md"
                borderRadius="lg"
                borderColor="red"
                className="w-full sm:w-auto text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3"
              >
                View Packages
              </MetallicButton>
            </div>
          </div>
        </div>
        <div className="absolute bottom-16 sm:bottom-20 left-0 right-0 w-full z-10 px-4">
          <BrandScroller speed={800} speedMobile={400} />
        </div>
        <MetallicDivider className="absolute bottom-10 left-0 right-0" />
      </section>

      {/* Partner Benefits promo — shown to non-members, scrolls to #membership */}
      <div className="px-4 sm:px-6 lg:px-8">
        <PartnerBenefitsPromoSectionClient scrollToId="membership" />
      </div>

      {/* Membership Sections */}
      <SectionContainer>
        <MembershipSection title="Ready to Join?" padding="py-16 sm:py-20" />
      </SectionContainer>
      <MembershipPackagesChart />

      {/* Unlock Discounts at the bottom */}
      <UnlockDiscounts
        hasAccess={hasPartnerDiscountAccess}
        showUnlockButton={!hasPartnerDiscountAccess}
        title={hasPartnerDiscountAccess ? "Partner Discounts" : "Unlock Partner Discounts"}
        description={
          hasPartnerDiscountAccess
            ? "Access exclusive discounts from Australia's top tool brands"
            : "Get instant access to exclusive discounts from Australia's top tool brands"
        }
        packageTheme={packageTheme}
      />

      {/* Membership Modal */}
      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
      />
    </>
  );
}
