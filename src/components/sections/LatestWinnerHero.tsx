"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trophy, MapPin, Gift, ChevronLeft, ChevronRight } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import type { WinnerSummary } from "@/types/winner";

interface LatestWinnerHeroProps {
  className?: string;
  contentWrapperClassName?: string;
}

export default function LatestWinnerHero({ className = "", contentWrapperClassName }: LatestWinnerHeroProps) {
  const [winners, setWinners] = useState<WinnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    fetchWinners();
  }, []);

  // Desktop carousel: auto-advance every 3 seconds
  useEffect(() => {
    if (winners.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % winners.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [winners.length]);

  const goToSlide = (index: number) => {
    setActiveIndex((index + winners.length) % winners.length);
  };

  const fetchWinners = async () => {
    try {
      const response = await fetch("/api/winners/all?limit=12");
      const data = await response.json();

      if (data.success && Array.isArray(data.winners)) {
        setWinners(data.winners);
      }
    } catch (error) {
      console.error("Error fetching winners:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className={`py-4 bg-transparent ${className}`}>
        <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-xl overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!winners.length) {
    return null;
  }

  return (
    <section className={`py-4 bg-gradient-to-b from-transparent via-gray-50/30 to-transparent ${className}`}>
      <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
        {/* Section Header */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-10">
          <div className="inline-flex items-center gap-1.5 sm:gap-3 mb-1 sm:mb-4 relative">
            <div className="p-1.5 sm:p-3 bg-gradient-to-br from-[#ee0000] via-red-600 to-red-700 rounded-lg sm:rounded-xl shadow-lg shadow-red-500/50 relative z-10">
              <Trophy className="w-4 h-4 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
            </div>
            <h2 className="text-2xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent font-['Poppins'] relative z-10">
              Latest Winners
            </h2>
          </div>
          <p className="text-xs sm:text-base lg:text-lg text-gray-600 font-['Inter'] max-w-2xl mx-auto px-1">
            Congratulations to our most recent draw winners!
          </p>
        </div>

        {/* Mobile/Tablet: Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 lg:hidden">
          {winners.map((winner) => {
            const displayImage = winner.imageUrl || "/images/placeholders/prize-placeholder.png";
            const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
            const completionDate = winner.wonOnDate
              ? new Date(winner.wonOnDate).toLocaleDateString("en-AU", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : new Date(winner.selectedDate).toLocaleDateString("en-AU", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
            return (
              <Link key={winner.id} href="/winners" className="block group">
                <div className="relative bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-gray-100 group-hover:border-red-200 transition-all duration-300 group-hover:shadow-2xl">
                  {/* Image area */}
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                    {winner.imageUrl ? (
                      <Image
                        src={displayImage}
                        alt={`${formattedName} - Winner of ${winner.prize.name}`}
                        fill
                        className="object-contain p-4"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-white">
                        <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full flex items-center justify-center font-bold text-2xl shadow-xl mb-2">
                          {winner.winnerFirstName?.charAt(0) || ""}
                          {winner.winnerLastName?.charAt(0) || ""}
                        </div>
                        <span className="text-sm font-medium text-gray-400">Winner Photo</span>
                      </div>
                    )}

                    {/* Draw name badge - top left, no animation */}
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-20">
                      <div className="bg-gradient-to-r from-[#ee0000] via-red-600 to-red-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-lg flex items-center gap-1.5 ring-2 ring-white/50">
                        <span>{winner.drawName}</span>
                      </div>
                    </div>

                    {/* Selected Prize badge - top right (major draws only) */}
                    {winner.drawType === "major" && winner.selectedPrize && (
                      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20">
                        <div className="bg-black/80 backdrop-blur-md rounded-lg px-2 py-1 sm:px-2.5 sm:py-1.5 border border-white/20">
                          <div className="flex items-center gap-1">
                            <Gift className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-bold text-white truncate max-w-[80px] sm:max-w-[100px]">
                              {winner.selectedPrize}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sophisticated Gradient Overlay - matches WinnerCard */}
                    <div className="absolute inset-0 "></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/90"></div>

                    {/* Winner Name Overlay - 100% from WinnerCard */}
                    <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-6">
                      <div className="bg-black/75 backdrop-blur-md rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-5 sm:py-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex items-center justify-between gap-3">
                        {/* Animated shimmer effect - active on mobile, enhanced on hover */}
                        <div className="absolute inset-0 sm:-translate-x-full sm:group-hover:translate-x-full animate-shimmer-horizontal sm:animate-none transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

                        {/* Winner Name and Location - left side - matches WinnerCard */}
                        <div className="relative flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 flex-1 min-w-0">
                          <p className="text-base sm:text-2xl font-bold font-['Poppins'] tracking-tight relative inline-block">
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
                              style={
                                {
                                  WebkitTextStroke: "1px rgba(255, 255, 255, 0.2)",
                                } as React.CSSProperties
                              }
                              aria-hidden="true"
                            >
                              {formattedName}
                            </span>
                            {/* Animated underline accent with glow - visible on mobile, animated on hover */}
                            <span className="absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-transparent via-yellow-400 via-white via-yellow-400 to-transparent w-full sm:w-0 sm:group-hover:w-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(255,215,0,0.6)]"></span>
                            {/* Shimmer effect overlay - active on mobile */}
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer-horizontal-fast sm:animate-none sm:-translate-x-full sm:group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></span>
                          </p>
                          {winner.winnerState && (
                            <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
                              <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300 sm:text-gray-300 sm:group-hover:text-yellow-300 transition-colors duration-300 flex-shrink-0" />
                              <span className="text-xs sm:text-sm text-gray-100 sm:text-gray-200 sm:group-hover:text-gray-100 transition-colors duration-300">{winner.winnerState}</span>
                            </div>
                          )}
                        </div>

                        {/* Draw date - right side, inside same overlay */}
                        <p className="flex-shrink-0 text-[10px] sm:text-xs font-bold text-white relative z-10">{completionDate}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: Carousel - one winner at a time, huge size, auto-advance every 3s */}
        <div className="hidden lg:block relative">
          <div className="relative max-w-4xl mx-auto">
            {winners.map((winner, index) => {
              const displayImage = winner.imageUrl || "/images/placeholders/prize-placeholder.png";
              const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
              const completionDate = winner.wonOnDate
                ? new Date(winner.wonOnDate).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" })
                : new Date(winner.selectedDate).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });
              const isActive = index === activeIndex;
              if (!isActive) return null;
              return (
                <Link key={winner.id} href="/winners" className="block group">
                  <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-gray-100 group-hover:border-red-200 transition-all duration-500 group-hover:shadow-[0_25px_80px_rgba(0,0,0,0.15)]">
                    <div className="relative h-[420px] xl:h-[500px] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                      {winner.imageUrl ? (
                        <Image
                          src={displayImage}
                          alt={`${formattedName} - Winner of ${winner.prize.name}`}
                          fill
                          className="object-contain p-8"
                          sizes="(min-width: 1280px) 896px, 832px"
                          priority={index === 0}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-white">
                          <div className="w-32 h-32 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full flex items-center justify-center font-bold text-4xl shadow-2xl mb-4">
                            {winner.winnerFirstName?.charAt(0) || ""}{winner.winnerLastName?.charAt(0) || ""}
                          </div>
                          <span className="text-lg font-medium text-gray-400">Winner Photo</span>
                        </div>
                      )}
                      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
                        <div className="bg-gradient-to-r from-[#ee0000] via-red-600 to-red-700 text-white px-5 py-2.5 rounded-xl text-base font-bold shadow-lg ring-2 ring-white/50">
                          {winner.drawName}
                        </div>
                      </div>
                      {winner.drawType === "major" && winner.selectedPrize && (
                        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
                          <div className="bg-black/80 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/20">
                            <div className="flex items-center gap-2">
                              <Gift className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                              <span className="text-sm font-bold text-white truncate max-w-[180px]">{winner.selectedPrize}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/90" />
                      <div className="absolute bottom-0 left-0 right-0 z-20 p-6 xl:p-8">
                        <div className="bg-black/75 backdrop-blur-md rounded-2xl px-6 py-4 xl:px-8 xl:py-5 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex items-center justify-between gap-4">
                          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                            <p className="text-2xl xl:text-3xl font-bold font-['Poppins'] tracking-tight relative inline-block">
                              <span className="absolute inset-0 bg-gradient-to-r from-yellow-400/30 via-white/40 to-yellow-400/30 bg-clip-text text-transparent blur-md opacity-60 animate-pulse" aria-hidden="true">{formattedName}</span>
                              <span className="relative z-10 bg-gradient-to-r from-white via-yellow-50 via-white to-yellow-50 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,255,255,0.9),0_0_25px_rgba(255,215,0,0.3)]">{formattedName}</span>
                              <span className="absolute inset-0 bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent blur-[2px] opacity-40 -z-0" style={{ WebkitTextStroke: "1px rgba(255, 255, 255, 0.2)" } as React.CSSProperties} aria-hidden="true">{formattedName}</span>
                            </p>
                            {winner.winnerState && (
                              <div className="flex items-center gap-2 relative z-10">
                                <MapPin className="w-5 h-5 text-yellow-300 flex-shrink-0" />
                                <span className="text-base text-gray-100">{winner.winnerState}</span>
                              </div>
                            )}
                          </div>
                          <p className="flex-shrink-0 text-base font-bold text-white">{completionDate}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Carousel nav - prev/next */}
          {winners.length > 1 && (
            <>
              <button
                onClick={(e) => { e.preventDefault(); goToSlide(activeIndex - 1); }}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 xl:-translate-x-4 z-30 w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white/90 hover:bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:text-[#ee0000] transition-colors"
                aria-label="Previous winner"
              >
                <ChevronLeft className="w-6 h-6 xl:w-7 xl:h-7" />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); goToSlide(activeIndex + 1); }}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 xl:translate-x-4 z-30 w-12 h-12 xl:w-14 xl:h-14 rounded-full bg-white/90 hover:bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:text-[#ee0000] transition-colors"
                aria-label="Next winner"
              >
                <ChevronRight className="w-6 h-6 xl:w-7 xl:h-7" />
              </button>

              {/* Dot indicators */}
              <div className="flex justify-center gap-2 mt-6">
                {winners.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.preventDefault(); goToSlide(i); }}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      i === activeIndex ? "bg-[#ee0000] w-8" : "bg-gray-300 hover:bg-gray-400"
                    }`}
                    aria-label={`Go to winner ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
