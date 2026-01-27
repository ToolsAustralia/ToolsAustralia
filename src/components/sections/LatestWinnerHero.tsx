"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trophy, MapPin, Calendar, Sparkles, Facebook, ExternalLink, Gift } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface LatestWinner {
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
  drawDate?: string;
  entryNumber?: number;
  selectedPrize?: string;
}

interface LatestWinnerHeroProps {
  className?: string;
  contentWrapperClassName?: string; // Optional className for the inner content wrapper
}

export default function LatestWinnerHero({ className = "", contentWrapperClassName }: LatestWinnerHeroProps) {
  const [winner, setWinner] = useState<LatestWinner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLatestWinner();
  }, []);

  const fetchLatestWinner = async () => {
    try {
      const response = await fetch("/api/winners/latest");
      const data = await response.json();

      if (data.success && data.winner) {
        setWinner(data.winner);
      }
    } catch (error) {
      console.error("Error fetching latest winner:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className={` bg-transparent ${className}`}>
        <div className="max-w-6xl mx-auto ">
          <div className="bg-white rounded-3xl shadow-xl p-8 animate-pulse">
            <div className="h-96 bg-gray-200 rounded-2xl mb-6"></div>
          </div>
        </div>
      </section>
    );
  }

  if (!winner) {
    return null;
  }

  // Prioritize winner's image, fallback to placeholder if not available
  const displayImage = winner.imageUrl || "/images/placeholders/prize-placeholder.png";
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const drawDate = winner.drawDate ? new Date(winner.drawDate) : new Date(winner.selectedDate);

  return (
    <section className={`py-4 bg-gradient-to-b from-transparent via-gray-50/30 to-transparent ${className}`}>
      <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
        {/* Section Header */}
        <div className="text-center mb-2 sm:mb-8 lg:mb-10">
          <div className="inline-flex items-center gap-1.5 sm:gap-3 mb-1 sm:mb-4 relative">
            {/* Animated background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#ee0000]/20 via-red-500/20 to-[#ee0000]/20 blur-2xl -z-10 animate-pulse"></div>
            <div className="p-1.5 sm:p-3 bg-gradient-to-br from-[#ee0000] via-red-600 to-red-700 rounded-lg sm:rounded-xl shadow-lg shadow-red-500/50 relative z-10">
              <Trophy className="w-4 h-4 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
            </div>
            <h2 className="text-2xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent font-['Poppins'] relative z-10">
              Latest Winner
            </h2>
          </div>
          <p className="text-xs sm:text-base lg:text-lg text-gray-600 font-['Inter'] max-w-2xl mx-auto px-1">
            🎉 Congratulations to our most recent draw winner! 🎉
          </p>
        </div>

        {/* Winner Card - 2 Column Layout */}
        <Link href="/winners" className="block">
          <div className="relative group cursor-pointer">
            {/* Decorative background elements */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#ee0000] via-red-500 to-[#ee0000] rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="absolute -inset-0.5 bg-gradient-to-br from-yellow-400/20 via-orange-500/20 to-red-500/20 rounded-3xl blur-sm"></div>
            
            <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-gray-100 group-hover:border-red-200 transition-all duration-500 group-hover:shadow-3xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Left Column - Image */}
              <div className="relative h-72 sm:h-80 lg:h-96 xl:h-[600px] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-3 sm:p-6 lg:p-8 overflow-hidden">
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#ee0000]/10 via-transparent to-yellow-400/10 animate-pulse"></div>
                
                {winner.imageUrl ? (
                  <div className="relative w-full h-full z-10">
                    {/* Glow effect behind image */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#ee0000]/20 to-yellow-400/20 blur-3xl -z-0"></div>
                    <Image
                      src={displayImage}
                      alt={`${formattedName} - Winner of ${winner.prize.name}`}
                      fill
                      className="object-contain drop-shadow-2xl"
                      priority
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                ) : (
                  <div className="text-center z-10">
                    <div className="w-32 h-32 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-4xl shadow-2xl mx-auto mb-4 ring-4 ring-yellow-400/30">
                      {winner.winnerFirstName.charAt(0)}
                      {winner.winnerLastName?.charAt(0) || ""}
                    </div>
                    <div className="text-gray-600 font-medium text-lg">Winner Photo</div>
                  </div>
                )}
                
                {/* Selected Prize Badge - Overlayed on Image (Top Right) - Only for major draws */}
                {winner.drawType === "major" && winner.selectedPrize && (
                  <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20">
                    <div className="bg-black/80 backdrop-blur-md rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2 border border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
                        <span className="text-[10px] sm:text-xs font-bold text-white font-['Poppins'] max-w-[120px] sm:max-w-[150px] truncate">
                          {winner.selectedPrize}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Winner Badge - Top Left (if no prize badge) or below prize badge */}
                <div className={`absolute ${winner.drawType === "major" && winner.selectedPrize ? "top-2 left-2 sm:top-4 sm:left-4" : "top-2 right-2 sm:top-4 sm:right-4"} bg-gradient-to-r from-[#ee0000] via-red-600 to-red-700 text-white px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-1.5 sm:gap-2 z-20 ring-2 ring-white/50 animate-bounce`}>
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" />
                  <span>Winner</span>
                </div>
                
                {/* Winner Name Overlay - Mobile Only */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/60 to-transparent sm:hidden z-20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="p-1 bg-gradient-to-br from-green-500 via-emerald-600 to-green-700 rounded-md shadow-lg">
                      <Trophy className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[8px] font-bold text-green-300 uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                      Congratulations
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-white font-['Poppins'] drop-shadow-lg">
                    {formattedName}
                  </h4>
                  {winner.winnerState && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-white/80" />
                      <span className="text-[10px] font-semibold text-white/90">{winner.winnerState}</span>
                    </div>
                  )}
                </div>
                
                {/* Decorative corner elements */}
                <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[#ee0000]/10 to-transparent rounded-br-full"></div>
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-yellow-400/10 to-transparent rounded-tl-full"></div>
              </div>

              {/* Right Column - Content */}
              <div className="p-3 sm:p-6 lg:p-10 xl:p-12 flex flex-col justify-center bg-gradient-to-br from-white via-gray-50/50 to-white relative overflow-hidden">
                {/* Decorative background pattern */}
                <div className="absolute inset-0 opacity-5">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#ee0000] to-yellow-400 rounded-full blur-3xl"></div>
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-yellow-400 to-[#ee0000] rounded-full blur-3xl"></div>
                </div>
                
                <div className="space-y-3 sm:space-y-6 lg:space-y-8 relative z-10 h-full flex flex-col justify-between">
                  {/* Top Section - Winner Info */}
                  <div className="space-y-3 sm:space-y-6">
                    {/* Winner Announcement - Hidden on Mobile */}
                    <div className="hidden sm:block relative bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 rounded-lg sm:rounded-2xl p-3 sm:p-6 lg:p-7 border-2 border-green-300 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden">
                      {/* Animated background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/10 to-green-400/10 animate-pulse"></div>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/10 rounded-full blur-2xl"></div>
                      
                      <div className="relative z-10">
                        <div className="flex items-center gap-1.5 sm:gap-3 mb-2 sm:mb-4">
                          <div className="p-1.5 sm:p-2.5 bg-gradient-to-br from-green-500 via-emerald-600 to-green-700 rounded-md sm:rounded-xl shadow-lg ring-2 ring-green-400/30">
                            <Trophy className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <span className="text-[9px] sm:text-xs font-bold text-green-700 uppercase tracking-wider bg-white/60 px-1.5 py-0.5 sm:px-3 sm:py-1.5 rounded-full">
                            Congratulations
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-3xl lg:text-4xl xl:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent font-['Poppins'] mb-2 sm:mb-4 leading-tight">
                          {formattedName}
                        </h4>
                        {winner.winnerState && (
                          <div className="flex items-center gap-1.5 text-gray-700 bg-white/70 px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-md sm:rounded-lg w-fit border border-gray-200">
                            <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-[#ee0000]" />
                            <span className="text-[10px] sm:text-sm font-semibold">{winner.winnerState}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Draw Details - Same Row on Mobile */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-4">
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-5 border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#ee0000] rounded-full"></div>
                          <span className="text-[9px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">Draw</span>
                        </div>
                        <p className="text-xs sm:text-lg font-bold text-gray-900 font-['Poppins']">
                          {winner.drawName}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-5 border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-[#ee0000]" />
                          <span className="text-[9px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed</span>
                        </div>
                        <p className="text-xs sm:text-lg font-bold text-gray-900 font-['Poppins']">
                          {drawDate.toLocaleDateString("en-AU", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Section - CTA */}
                  <div className="pt-1.5 sm:pt-4">
                    <button
                      type="button"
                      data-facebook-link
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open("https://www.facebook.com/toolsaust", "_blank", "noopener,noreferrer");
                      }}
                      className="group/btn relative inline-flex items-center justify-center gap-1.5 sm:gap-3 w-full bg-gradient-to-r from-[#1877F2] via-[#0D5FDB] to-[#0A4FBF] hover:from-[#0D5FDB] hover:via-[#0A4FBF] hover:to-[#1877F2] text-white px-3 py-2.5 sm:px-6 sm:py-4 rounded-lg sm:rounded-xl font-bold shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] text-center overflow-hidden text-xs sm:text-base"
                    >
                      {/* Animated background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-[#1877F2] to-[#0D5FDB] opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                      <div className="absolute top-0 left-0 w-full h-full bg-white/10 transform -skew-x-12 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700"></div>
                      
                      <Facebook className="w-3.5 h-3.5 sm:w-5 sm:h-5 relative z-10" />
                      <span className="relative z-10">Watch Live Draw on Facebook</span>
                      <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 relative z-10 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}

