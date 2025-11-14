"use client";

import { useEffect } from "react";
import Image from "next/image";
import MetallicButton from "@/components/ui/MetallicButton";
import MetallicDivider from "@/components/ui/MetallicDivider";
import BrandScroller from "@/components/ui/BrandScroller";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import MembershipSection from "@/components/sections/MembershipSection";
import FlowChartSection from "@/components/sections/FlowChartSection";
import MembershipPackagesChart from "@/components/sections/MembershipPackagesChart";
import { useMemberships } from "@/hooks/useMemberships";
import { convertToLocalPlan } from "@/utils/membership/membership-adapters";

export default function MembershipPageClient() {
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

  // Resolve Foreman subscription plan from static packages
  const { subscriptionPackages } = useMemberships();
  const foremanApiPackage = subscriptionPackages.find((p) => p._id === "foreman-subscription");
  const foremanLocalPlan = foremanApiPackage ? convertToLocalPlan(foremanApiPackage) : undefined;

  return (
    <>
      {/* Hero + brand scroller */}
      <section className="relative pt-[86px] sm:pt-[106px] pb-12 bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden min-h-[100svh]">
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/background/memebership.png"
            alt="Tools Australia Membership"
            fill
            className="object-cover opacity-20"
            priority
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
                  if (foremanLocalPlan) {
                    window.dispatchEvent(
                      new CustomEvent("openMembershipModal", { detail: { plan: foremanLocalPlan } })
                    );
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

      {/* Membership Sections */}
      <MembershipSection title="Ready to Join?" padding="py-16 sm:py-20" />
      <FlowChartSection />
      <MembershipPackagesChart />

      {/* Unlock Discounts at the bottom */}
      <UnlockDiscounts />
    </>
  );
}
