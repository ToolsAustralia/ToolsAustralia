"use client";

import React, { useMemo } from "react";
import { Users, Gift, Award } from "lucide-react";
import { useCompletedMajorDraws } from "@/hooks/queries/useMajorDrawQueries";

interface MajorDrawStats {
  totalDraws: number;
  totalParticipants: number;
  totalEntries: number;
  totalPrizeValue: number;
  totalWinners: number;
  averageEntriesPerDraw: number;
  averagePrizeValue: number;
}

interface MajorDrawStatsProps {
  className?: string;
}

const MajorDrawStats: React.FC<MajorDrawStatsProps> = ({ className = "" }) => {
  const { data: completedDrawsData, isLoading, error } = useCompletedMajorDraws();

  const stats = useMemo((): MajorDrawStats => {
    if (!completedDrawsData?.draws) {
      return {
        totalDraws: 0,
        totalParticipants: 0,
        totalEntries: 0,
        totalPrizeValue: 0,
        totalWinners: 0,
        averageEntriesPerDraw: 0,
        averagePrizeValue: 0,
      };
    }

    const draws = completedDrawsData.draws;

    // Calculate statistics
    const totalDraws = draws.length;
    const totalParticipants = draws.reduce((sum, draw) => sum + draw.participantCount, 0);
    const totalEntries = draws.reduce((sum, draw) => sum + draw.totalEntries, 0);
    const totalPrizeValue = draws.reduce((sum, draw) => sum + draw.prize.value, 0);
    const totalWinners = draws.filter((draw) => draw.winner).length;
    const averageEntriesPerDraw = totalDraws > 0 ? Math.round(totalEntries / totalDraws) : 0;
    const averagePrizeValue = totalDraws > 0 ? Math.round(totalPrizeValue / totalDraws) : 0;

    return {
      totalDraws,
      totalParticipants,
      totalEntries,
      totalPrizeValue,
      totalWinners,
      averageEntriesPerDraw,
      averagePrizeValue,
    };
  }, [completedDrawsData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (error) {
    console.error("Error fetching major draw stats:", error);
    // Continue rendering with default stats on error
  }

  // Note: We don't show loading spinner anymore - stats will display with 0 values while loading

  return (
    <div className={`absolute left-1/2 transform -translate-x-1/2 z-20 w-full sm:max-w-6xl px-2 sm:px-4 ${className}`}>
      {/* Mobile: Single Card with 3 Sections */}
      <div className="sm:hidden">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black border border-red-500/50 rounded-2xl p-3 overflow-hidden w-full shadow-2xl backdrop-blur-sm">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>

          <div className="relative z-10 grid grid-cols-3 gap-2">
            {/* Total Prize Value */}
            <div className="text-center">
              <div className="w-8 h-8 bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-full flex items-center justify-center shadow-lg mx-auto mb-1 ring-2 ring-red-300/30">
                <Gift className="w-4 h-4 text-white drop-shadow-md" />
              </div>
              <div className="text-sm font-bold text-white mb-0.5 font-['Poppins']">
                {formatCurrency(stats.totalPrizeValue)}
              </div>
              <p className="text-[10px] text-gray-300 font-medium leading-tight">Total given in prizes</p>
            </div>

            {/* Winners to Date */}
            <div className="text-center">
              <div className="w-8 h-8 bg-gradient-to-br from-slate-400 via-gray-300 to-slate-200 rounded-full flex items-center justify-center shadow-lg mx-auto mb-1 ring-2 ring-slate-400/30">
                <Award className="w-4 h-4 text-gray-900 drop-shadow-md" />
              </div>
              <div className="text-sm font-bold text-white mb-0.5 font-['Poppins']">
                {stats.totalWinners.toLocaleString()}
              </div>
              <p className="text-[10px] text-gray-300 font-medium leading-tight">Winners to date</p>
            </div>

            {/* Total Entries */}
            <div className="text-center">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 via-cyan-400 to-blue-300 rounded-full flex items-center justify-center shadow-lg mx-auto mb-1 ring-2 ring-blue-400/30">
                <Users className="w-4 h-4 text-gray-900 drop-shadow-md" />
              </div>
              <div className="text-sm font-bold text-white mb-0.5 font-['Poppins']">
                {stats.totalEntries.toLocaleString()}
              </div>
              <p className="text-[10px] text-gray-300 font-medium leading-tight">Total entries</p>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Original Layout */}
      <div className="hidden sm:block relative h-20 sm:h-28">
        {/* Total Prize Value Card */}
        <div className="absolute left-8 top-0 w-1/3 h-full bg-gradient-to-br from-gray-900 via-gray-800 to-black border border-red-500/50 p-4 sm:p-6 overflow-hidden shadow-2xl backdrop-blur-sm clip-card-left">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>
          <div className="relative z-10 flex items-center justify-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-full flex items-center justify-center shadow-lg ring-4 ring-red-300/20">
              <Gift className="w-8 h-8 text-white drop-shadow-md" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white mb-1 font-['Poppins']">
                {formatCurrency(stats.totalPrizeValue)}
              </div>
              <p className="text-xs sm:text-sm text-gray-300 font-medium">Total given in prizes</p>
            </div>
          </div>
        </div>

        {/* Winners to Date Card */}
        <div className="absolute left-1/3 top-0 w-1/3 h-full bg-gradient-to-br from-gray-900 via-gray-800 to-black border border-red-500/50 p-4 sm:p-6 overflow-hidden shadow-2xl backdrop-blur-sm clip-card-center">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>
          <div className="relative z-10 flex items-center justify-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-slate-400 via-gray-300 to-slate-200 rounded-full flex items-center justify-center shadow-lg ring-4 ring-slate-400/20">
              <Award className="w-8 h-8 text-gray-900 drop-shadow-md" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white mb-1 font-['Poppins']">
                {stats.totalWinners.toLocaleString()}
              </div>
              <p className="text-xs sm:text-sm text-gray-300 font-medium">Winners to date</p>
            </div>
          </div>
        </div>

        {/* Total Entries Card */}
        <div className="absolute right-8 top-0 w-1/3 h-full bg-gradient-to-br from-gray-900 via-gray-800 to-black border border-red-500/50 p-4 sm:p-6 overflow-hidden shadow-2xl backdrop-blur-sm clip-card-right">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>
          <div className="relative z-10 flex items-center justify-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 via-cyan-400 to-blue-300 rounded-full flex items-center justify-center shadow-lg ring-4 ring-blue-400/20">
              <Users className="w-8 h-8 text-gray-900 drop-shadow-md" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white mb-1 font-['Poppins']">
                {stats.totalEntries.toLocaleString()}
              </div>
              <p className="text-xs sm:text-sm text-gray-300 font-medium">Total entries</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MajorDrawStats;
