"use client";

import { UserData } from "@/hooks/queries/useUserQueries";
import { Star, Trophy } from "lucide-react";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

interface RewardsOverviewProps {
  user: UserData;
}

export default function RewardsOverview({ user }: RewardsOverviewProps) {
  const isRewardsFeatureEnabled = rewardsEnabled();
  const pauseMessage = rewardsDisabledMessage();

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200/50">
      <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-gray-100">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-[#ee0000]/10 rounded-lg">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#ee0000]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 font-['Poppins']">
              Rewards Overview
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
              Your current rewards status and available points
            </p>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6 md:p-8">
        {/* Points Display */}
        <div className="flex justify-center">
          <div className="text-center group">
            <div className="relative">
              <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 bg-[#ee0000] rounded-full flex items-center justify-center">
                <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 text-white fill-current" />
              </div>
            </div>
            {isRewardsFeatureEnabled ? (
              <>
                <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-1 sm:mb-2 font-['Poppins']">
                  {user.rewardsPoints.toLocaleString()}
                </h3>
                <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-600 font-medium">Available Points</p>
              </>
            ) : (
              <div className="max-w-md">
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 font-['Poppins']">
                  Rewards Paused
                </h3>
                <p className="text-sm sm:text-base text-gray-600 font-medium leading-relaxed">{pauseMessage}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
