"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import RewardsPageClient from "./components/RewardsPageClient";
import { useUserContext } from "@/contexts/UserContext";
import { Loader2 } from "lucide-react";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

export default function RewardsPage() {
  const { userData, loading, isAuthenticated } = useUserContext();
  const isRewardsFeatureEnabled = rewardsEnabled();

  // Early-out with maintenance messaging when rewards are paused
  if (!isRewardsFeatureEnabled) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center bg-white px-6 py-16">
        <div className="max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Rewards Are Temporarily Paused</h1>
          <p className="text-gray-600 leading-relaxed mb-6">{rewardsDisabledMessage()}</p>
          <p className="text-sm text-gray-500">
            Need assistance with a past redemption or your account balance? Contact our support team and we will be
            happy to help while we upgrade the rewards experience.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#ee0000]" />
          <p className="text-gray-600">Loading your rewards...</p>
        </div>
      </div>
    );
  }

  // Show authentication required
  if (!isAuthenticated || !userData) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
          <p className="text-gray-600">Please log in to view your rewards.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh bg-white">
      <RewardsPageClient user={userData} />

      {/* Membership Section */}
      <MembershipSection
        title="MAXIMIZE YOUR REWARDS WITH PREMIUM MEMBERSHIP"
        padding="py-8 sm:py-12 lg:pb-16 mb-16 "
      />
    </div>
  );
}
