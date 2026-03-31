"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Trophy, Calendar, Award, MapPin, ChevronLeft, ChevronRight, Gift } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface Winner {
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
  wonOnDate?: string;
  entryNumber?: number;
  selectedPrize?: string;
}

interface WinnersSectionProps {
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function WinnersSection({
  className = "",
  title = "Recent Winners",
  subtitle = "Congratulations to our recent winners! Your dreams can come true too.",
}: WinnersSectionProps) {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerView, setItemsPerView] = useState(3);

  useEffect(() => {
    fetchWinners();
    updateItemsPerView();
    window.addEventListener("resize", updateItemsPerView);
    return () => window.removeEventListener("resize", updateItemsPerView);
  }, []);

  const updateItemsPerView = () => {
    if (window.innerWidth < 640) {
      setItemsPerView(1);
    } else if (window.innerWidth < 1024) {
      setItemsPerView(2);
    } else {
      setItemsPerView(3);
    }
  };

  const fetchWinners = async () => {
    try {
      const response = await fetch("/api/winners/all?limit=12");
      const data = await response.json();

      if (data.success && data.winners) {
        setWinners(data.winners);
      }
    } catch (error) {
      console.error("Error fetching winners:", error);
    } finally {
      setLoading(false);
    }
  };

  const maxIndex = Math.max(0, winners.length - itemsPerView);

  const goToPrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
  };

  const visibleWinners = winners.slice(currentIndex, currentIndex + itemsPerView);

  return (
    <section
      className={`relative py-16 lg:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 w-full overflow-hidden ${className}`}
    >
      <div className="relative w-full px-4 sm:px-6 lg:px-8 lg:max-w-7xl lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-[#ee0000] to-red-700 rounded-xl shadow-lg">
              <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 font-['Poppins']">{title}</h2>
          </div>
          <p className="text-base sm:text-lg text-gray-600 dark:text-neutral-400 max-w-3xl mx-auto leading-relaxed font-['Inter']">
            {subtitle}
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-pulse"
              >
                <div className="h-48 bg-gray-200"></div>
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Winners Carousel */}
        {!loading && winners.length > 0 && (
          <div className="relative">
            {/* Navigation Buttons */}
            {winners.length > itemsPerView && (
              <>
                <button
                  onClick={goToPrevious}
                  disabled={currentIndex === 0}
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-20 bg-white rounded-full p-3 shadow-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hidden lg:flex items-center justify-center"
                  aria-label="Previous winners"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-neutral-200" />
                </button>
                <button
                  onClick={goToNext}
                  disabled={currentIndex >= maxIndex}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 bg-white rounded-full p-3 shadow-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hidden lg:flex items-center justify-center"
                  aria-label="Next winners"
                >
                  <ChevronRight className="w-6 h-6 text-gray-700 dark:text-neutral-200" />
                </button>
              </>
            )}

            {/* Winners Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {visibleWinners.map((winner) => {
                const displayImage =
                  winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";
                const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
                const wonOnDate = new Date(winner.wonOnDate ?? winner.selectedDate);

                return (
                  <div
                    key={winner.id}
                    className="group relative bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-100/80 hover:shadow-[0_20px_60px_rgba(0,0,0,0.15)] transition-all duration-500 overflow-hidden"
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
                        sizes="(max-width: 1024px) 50vw, 33vw"
                        priority={false}
                      />

                      {/* Sophisticated Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20"></div>

                      {/* Draw Type Badge - Top Left */}
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

                      {/* Selected Prize Badge - Overlayed on Image (Top Right) - Only for major draws */}
                      {winner.drawType === "major" && winner.selectedPrize && (
                        <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20">
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

                      {/* Winner Name Overlay - Bottom */}
                      <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-6">
                        <div className="bg-black/75 backdrop-blur-md rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-5 sm:py-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
                          {/* Animated shimmer effect */}
                          <div className="absolute inset-0 sm:-translate-x-full sm:group-hover:translate-x-full animate-shimmer-horizontal sm:animate-none transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                          
                          {/* Winner Name and Location - Same Row */}
                          <div className="relative flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1">
                            <p className="text-base sm:text-2xl font-bold font-['Poppins'] tracking-tight relative inline-block">
                              <span 
                                className="absolute inset-0 bg-gradient-to-r from-yellow-400/30 via-white/40 to-yellow-400/30 bg-clip-text text-transparent blur-md opacity-60 animate-pulse"
                                aria-hidden="true"
                              >
                                {formattedName}
                              </span>
                              <span className="relative z-10 bg-gradient-to-r from-white via-yellow-50 via-white to-yellow-50 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)] sm:drop-shadow-[0_0_10px_rgba(255,255,255,0.6)] sm:group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)] transition-all duration-300">
                                {formattedName}
                              </span>
                            </p>
                            {winner.winnerState && (
                              <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
                                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300 sm:text-gray-300 sm:group-hover:text-yellow-300 transition-colors duration-300 flex-shrink-0" />
                                <span className="text-xs sm:text-sm text-gray-100 sm:text-gray-200 sm:group-hover:text-gray-100 transition-colors duration-300">{winner.winnerState}</span>
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
                          <div className="p-1.5 sm:p-2 bg-gradient-to-br from-[#ee0000] to-red-700 rounded-lg sm:rounded-xl shadow-lg flex-shrink-0">
                            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <span className="text-sm sm:text-lg font-bold text-gray-900 font-['Poppins'] tracking-tight truncate">
                            {winner.drawName}
                          </span>
                        </div>

                        {/* Win Date */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg sm:rounded-xl">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-neutral-400" />
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] sm:text-xs text-gray-500 font-['Inter'] font-medium block">Won on</span>
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
              })}
            </div>

            {/* Carousel Indicators */}
            {winners.length > itemsPerView && (
              <div className="flex justify-center gap-2 mt-8">
                {Array.from({ length: Math.ceil(winners.length / itemsPerView) }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index * itemsPerView)}
                    className={`h-2 rounded-full transition-all duration-200 ${
                      Math.floor(currentIndex / itemsPerView) === index
                        ? "w-8 bg-[#ee0000]"
                        : "w-2 bg-gray-300 hover:bg-gray-400"
                    }`}
                    aria-label={`Go to page ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && winners.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full mb-4">
              <Trophy className="w-10 h-10 text-gray-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 font-['Poppins'] mb-2">No Winners Yet</h3>
            <p className="text-gray-600 dark:text-neutral-400 font-['Inter']">Check back soon to see our amazing winners!</p>
          </div>
        )}
      </div>
    </section>
  );
}
