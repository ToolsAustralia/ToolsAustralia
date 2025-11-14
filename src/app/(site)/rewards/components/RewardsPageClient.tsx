"use client";

import Link from "next/link";
import { ShoppingCart, Users, Star } from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";
import { UserData } from "@/hooks/queries/useUserQueries";
import { useState } from "react";
import RewardsOverview from "./RewardsOverview";
import PartnerDiscounts from "./PartnerDiscounts";
import RewardsHistory from "./RewardsHistory";
import RewardsRedemption from "./RewardsRedemption";

interface RewardsPageClientProps {
  user: UserData;
}

export default function RewardsPageClient({ user }: RewardsPageClientProps) {
  const { isAnySidebarOpen } = useSidebar();
  const [currentUserPoints, setCurrentUserPoints] = useState(user.rewardsPoints);

  // Handle points update from redemption
  const handlePointsUpdate = (newPoints: number) => {
    setCurrentUserPoints(newPoints);
  };

  // Create updated user object with current points
  const updatedUser = {
    ...user,
    rewardsPoints: currentUserPoints,
  };

  return (
    <>
      {/* Floating Action Buttons - Mobile/Tablet Only - Hide when sidebars are open */}
      {!isAnySidebarOpen && (
        <div className="lg:hidden fixed right-3 bottom-4 z-50 flex flex-col gap-2">
          <div className="group relative">
            <Link
              href="/shop"
              className="bg-[#ee0000] text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <ShoppingCart className="w-5 h-5" />
            </Link>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Start Shopping
              </div>
            </div>
          </div>
          <div className="group relative">
            <Link
              href="/membership"
              className="bg-gradient-to-r from-amber-500 to-yellow-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <Star className="w-5 h-5" />
            </Link>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Upgrade Membership
              </div>
            </div>
          </div>
          <div className="group relative">
            <Link
              href="/refer"
              className="bg-green-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <Users className="w-5 h-5" />
            </Link>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Refer Friends
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-50 pt-[86px] sm:pt-[106px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
            {/* Left Column - Rewards Overview and Package Redemption */}
            <div className="lg:col-span-2 space-y-6 sm:space-y-8">
              {/* Rewards Overview */}
              <RewardsOverview user={updatedUser} />

              {/* Package Redemption */}
              <RewardsRedemption user={updatedUser} onPointsUpdate={handlePointsUpdate} />
            </div>

            {/* Right Column - Rewards History and Partner Discounts */}
            <div
              className="space-y-6 sm:space-y-8 "
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "#ee0000 #f3f4f6",
              }}
            >
              {/* Rewards History */}
              <RewardsHistory user={updatedUser} />

              {/* Partner Discounts */}
              <PartnerDiscounts />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
