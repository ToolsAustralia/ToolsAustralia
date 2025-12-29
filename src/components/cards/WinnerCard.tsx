"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Calendar, Award } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

export interface WinnerCardData {
  id: string;
  drawId: string;
  drawName: string;
  drawType: "major" | "mini";
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
  };
  winnerFirstName: string;
  winnerLastName: string;
  winnerState?: string;
  imageUrl?: string;
  selectedDate: string;
  entryNumber?: number;
}

interface WinnerCardProps {
  winner: WinnerCardData;
  className?: string;
}

/**
 * World-class Winner Card Component
 * Elegant, elevated design with premium aesthetics
 */
export default function WinnerCard({ winner, className = "" }: WinnerCardProps) {
  const displayImage =
    winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const selectedDate = new Date(winner.selectedDate);

  return (
    <div
      className={`group relative bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-100/80 hover:shadow-[0_20px_60px_rgba(0,0,0,0.15)] transition-all duration-500 overflow-hidden ${className}`}
    >
      {/* Premium Glow Effect on Hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 via-red-500/0 to-red-500/0 group-hover:from-red-500/5 group-hover:via-red-500/3 group-hover:to-red-500/5 transition-all duration-500 rounded-3xl pointer-events-none z-0"></div>

      {/* Winner Image Section */}
      <div className="relative h-72 sm:h-80 bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200 overflow-hidden">
        <Image
          src={displayImage}
          alt={`${formattedName} - ${winner.drawName}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={false}
        />

        {/* Sophisticated Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20"></div>

        {/* Draw Type Badge - Premium Design */}
        <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-20">
          <div
            className={`px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-bold shadow-[0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-sm border ${
              winner.drawType === "major"
                ? "bg-gradient-to-r from-[#ee0000] via-red-600 to-[#ee0000] text-white border-red-400/40 shadow-red-500/20"
                : "bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 text-black border-amber-300/50 shadow-amber-500/20"
            }`}
          >
            {winner.drawType === "major" ? "Major Draw" : "Mini Draw"}
          </div>
        </div>

        {/* Winner Name Overlay - Elevated Design */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-6">
          <div className="bg-black/75 backdrop-blur-md rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-5 sm:py-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
            {/* Animated shimmer effect - active on mobile, enhanced on hover */}
            <div className="absolute inset-0 sm:-translate-x-full sm:group-hover:translate-x-full animate-shimmer-horizontal sm:animate-none transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            
            {/* Winner Name with Enhanced CSS Effects */}
            <div className="relative">
              <p className="text-base sm:text-2xl font-bold font-['Poppins'] mb-1 sm:mb-2 tracking-tight relative inline-block">
                {/* Outer glow layer - animated pulse - always active */}
                <span 
                  className="absolute inset-0 bg-gradient-to-r from-yellow-400/30 via-white/40 to-yellow-400/30 bg-clip-text text-transparent blur-md opacity-60 animate-pulse"
                  aria-hidden="true"
                >
                  {formattedName}
                </span>
                {/* Main gradient text with multiple layers for depth - enhanced shadow on mobile */}
                <span className="relative z-10 bg-gradient-to-r from-white via-yellow-50 via-white to-yellow-50 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)] sm:drop-shadow-[0_0_10px_rgba(255,255,255,0.6)] sm:group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)] transition-all duration-300">
                  {formattedName}
                </span>
                {/* Text stroke/outline for definition */}
                <span 
                  className="absolute inset-0 bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent blur-[2px] opacity-40 -z-0"
                  style={{
                    WebkitTextStroke: '1px rgba(255, 255, 255, 0.2)',
                  } as React.CSSProperties}
                  aria-hidden="true"
                >
                  {formattedName}
                </span>
                {/* Animated underline accent with glow - visible on mobile, animated on hover */}
                <span className="absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-transparent via-yellow-400 via-white via-yellow-400 to-transparent w-full sm:w-0 sm:group-hover:w-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(255,215,0,0.6)]"></span>
                {/* Shimmer effect overlay - active on mobile */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer-horizontal-fast sm:animate-none sm:-translate-x-full sm:group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></span>
              </p>
            </div>
            
            {winner.winnerState && (
              <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300 sm:text-gray-300 sm:group-hover:text-yellow-300 transition-colors duration-300" />
                <span className="text-xs sm:text-sm text-gray-100 sm:text-gray-200 sm:group-hover:text-gray-100 transition-colors duration-300">{winner.winnerState}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="relative z-10 p-4 sm:p-7 bg-white">
        {/* Draw Name - Prominent Display */}
        <div className="mb-3 sm:mb-5">
          <div className="inline-flex items-center gap-2 sm:gap-3 bg-gradient-to-r from-red-50 via-orange-50 to-red-50 rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-5 sm:py-4 border border-red-100/80 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="p-1.5 sm:p-2 bg-gradient-to-br from-[#ee0000] to-red-700 rounded-lg sm:rounded-xl shadow-lg">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-sm sm:text-xl font-bold text-gray-900 font-['Poppins'] tracking-tight">
              {winner.drawName}
            </span>
          </div>
        </div>

        {/* Win Date - Elegant Display */}
        <div className="flex items-center gap-2 sm:gap-3  pb-4 sm:pb-6 border-b border-gray-100">
          <div className="p-1.5 sm:p-2 bg-gray-50 rounded-lg sm:rounded-xl">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          </div>
          <div>
            <span className="text-xs sm:text-sm text-gray-500 font-['Inter'] font-medium">Won on</span>
            <p className="text-sm sm:text-base text-gray-900 font-['Inter'] font-semibold">
              {selectedDate.toLocaleDateString("en-AU", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* View Details Link - Premium CTA */}
        <Link
          href={
            winner.drawType === "major"
              ? `/promotions/${DEFAULT_PRIZE_SLUG}`
              : `/mini-draws/${winner.drawId}`
          }
          className="group/link flex items-center justify-between w-full px-4 py-2.5 sm:px-5 sm:py-3.5 bg-gradient-to-r from-[#ee0000] to-red-700 hover:from-red-700 hover:to-[#ee0000] text-white rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm font-['Poppins'] transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-red-500/30"
        >
          <span>{winner.drawType === "major" ? "View Promotions" : "View Draw Details"}</span>
          <span className="group-hover/link:translate-x-1 transition-transform duration-300">→</span>
        </Link>
      </div>
    </div>
  );
}

