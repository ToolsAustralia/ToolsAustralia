"use client";

/**
 * Carousel-style winner card used by `RecentWinnersCarousel`.
 *
 * NOTE: a different `WinnerCard` already lives in this folder (the
 * `/winners` gallery card with promo-theme borders and a "View draw" CTA).
 * This component is the homepage carousel variant — full-bleed photo with
 * a name overlay and a draw badge — and intentionally has a different
 * visual treatment, hence the distinct file.
 */

import { memo } from "react";
import Image from "next/image";
import { Calendar, Award, MapPin, Gift } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { cn } from "@/utils/cn";
import type { RecentWinner } from "@/hooks/queries/useRecentWinners";

interface RecentWinnerCardProps {
  winner: RecentWinner;
  className?: string;
}

export const RecentWinnerCard = memo(function RecentWinnerCard({
  winner,
  className,
}: RecentWinnerCardProps) {
  const displayImage =
    winner.imageUrl || winner.prize.images[0] || "/images/promotion/PrizeHeader/PrizeHeader.webp";
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const wonOnDate = new Date(winner.wonOnDate ?? winner.selectedDate);

  return (
    <div
      className={cn(
        "group relative bg-white rounded-3xl shadow-[var(--ta-shadow-card)] border border-gray-100/80 hover:shadow-[var(--ta-shadow-card-hover)] hover:translate-y-[var(--ta-card-hover-y)] transition-[transform,opacity,box-shadow] duration-[var(--ta-transition-dur)] overflow-hidden h-full",
        className,
      )}
    >
      {/* Premium Glow Effect on Hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 via-red-500/0 to-red-500/0 group-hover:from-red-500/5 group-hover:via-red-500/3 group-hover:to-red-500/5 transition-all duration-500 rounded-3xl pointer-events-none z-0"></div>

      {/* Winner Image Section */}
      <div className="relative h-72 sm:h-80 lg:h-96 bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200 overflow-hidden">
        <Image
          src={displayImage}
          alt={`${formattedName} - ${winner.prize.name}`}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={false}
        />

        {/* Sophisticated Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20"></div>

        {/* Draw Type Badge - Top Left */}
        <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-20">
          <div
            className={`px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl text-2xs sm:text-xs font-bold shadow-[0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-sm border ${
              winner.drawType === "major"
                ? "bg-gradient-to-r from-red-600 via-red-600 to-red-600 text-white border-red-400/40 shadow-red-500/20"
                : "bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 text-black border-amber-300/50 shadow-amber-500/20"
            }`}
          >
            {winner.drawType === "major" ? "Major Draw" : "Mini Draw"}
          </div>
        </div>

        {/* Selected Prize Badge - Overlayed on Image (Top Right) - Only for major draws */}
        {winner.drawType === "major" && winner.selectedPrize && (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20">
            <div className="bg-black/80 backdrop-blur-[var(--ta-blur)] rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 border border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
                <span className="text-2xs sm:text-xs font-bold text-white font-poppins max-w-[120px] sm:max-w-[150px] truncate">
                  {winner.selectedPrize}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Winner Name Overlay - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-6">
          <div className="bg-black/75 backdrop-blur-[var(--ta-blur)] rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-5 sm:py-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
            {/* Winner Name and Location - Same Row */}
            <div className="relative flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1">
              <p className="text-base sm:text-2xl font-bold font-poppins tracking-tight relative inline-block">
                <span className="relative z-10 bg-gradient-to-r from-white via-yellow-50 via-white to-yellow-50 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)] sm:drop-shadow-[0_0_10px_rgba(255,255,255,0.6)] sm:group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)] transition-[filter,color] duration-[var(--ta-transition-dur)]">
                  {formattedName}
                </span>
              </p>
              {winner.winnerState && (
                <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300 sm:text-gray-300 sm:group-hover:text-yellow-300 transition-colors duration-300 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-100 sm:text-gray-200 sm:group-hover:text-gray-100 transition-colors duration-300">
                    {winner.winnerState}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="relative z-10 p-4 sm:p-7 bg-white">
        {/* Draw Name and Win Date - Same Row */}
        <div className="flex items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-5 pb-4 sm:pb-6 border-b border-gray-100">
          {/* Draw Name */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="p-1.5 sm:p-2 bg-gradient-to-br from-red-600 to-red-700 rounded-lg sm:rounded-xl shadow-lg flex-shrink-0">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-sm sm:text-lg font-bold text-gray-900 font-poppins tracking-tight truncate">
              {winner.drawName}
            </span>
          </div>

          {/* Win Date */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg sm:rounded-xl">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-neutral-400" />
            </div>
            <div className="text-right">
              <span className="text-2xs sm:text-xs text-gray-500 font-['Inter'] font-medium block">
                Won on
              </span>
              <p className="text-xs sm:text-sm text-gray-900 font-['Inter'] font-semibold whitespace-nowrap">
                {wonOnDate.toLocaleDateString("en-AU", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
