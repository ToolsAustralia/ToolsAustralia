import { Metadata } from "next";
import MembershipSection from "@/components/sections/MembershipSection";
import FloatingCountdownBanner from "@/components/banners/FloatingCountdownBanner";
import WinnersPageClient from "./components/WinnersPageClient";

export const metadata: Metadata = {
  title: "Winners | Tools Australia",
  description:
    "Celebrate our incredible winners and their amazing achievements. See who has won tools and equipment from Tools Australia.",
};

export default function WinnersPage() {
  return (
    <div className="min-h-screen-svh bg-white pt-[60px] sm:pt-[70px]">
      {/* Client-rendered: Hero, Filters, Winners Grid, Testimony */}
      <WinnersPageClient />

      {/* Membership Section - Same structure as /draw-results (server-rendered layout, client MembershipSection) */}
      <div className="bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12 pb-28 sm:pb-36">
          <MembershipSection
            title="BE OUR NEXT WINNER"
            padding="py-4 sm:py-8 lg:py-12 lg:pb-16 mb-8 sm:mb-16"
          />
        </div>
      </div>

      <FloatingCountdownBanner />
    </div>
  );
}
