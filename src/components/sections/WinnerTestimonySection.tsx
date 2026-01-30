"use client";

import React from "react";
import Image from "next/image";
import { MessageSquare, Quote, Award, Calendar, Gift, MapPin } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface WinnerWithTestimony {
  id: string;
  winnerFirstName: string;
  winnerLastName: string;
  winnerState?: string;
  drawName: string;
  drawType: "major" | "mini";
  selectedDate: string;
  wonOnDate?: string;
  testimony?: string;
  selectedPrize?: string;
  prize: {
    name: string;
    value: number;
  };
}

interface WinnerTestimonySectionProps {
  winners: WinnerWithTestimony[];
  className?: string;
}

/**
 * WinnerTestimonySection - Premium testimony display component
 * Matches the sophisticated design aesthetic of WinnerCard with enhanced typography and visual hierarchy
 */
export default function WinnerTestimonySection({
  winners,
  className = "",
}: WinnerTestimonySectionProps) {
  // Filter winners who have testimonies
  // Check for testimony field and ensure it's a non-empty string
  const winnersWithTestimonies = winners.filter((winner) => {
    return (
      winner.testimony !== undefined &&
      winner.testimony !== null &&
      typeof winner.testimony === 'string' &&
      winner.testimony.trim().length > 0
    );
  });

  // If no testimonies, show empty state
  if (winnersWithTestimonies.length === 0) {
    return (
      <section className={`py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 ${className}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full mb-4">
              <MessageSquare className="w-8 h-8 text-gray-500" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-['Poppins'] mb-2">
              Winner Testimonies
            </h2>
            <p className="text-gray-600 font-['Inter'] max-w-2xl mx-auto">
              Check back soon to read inspiring stories from our winners!
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`py-8 sm:py-12 lg:py-16 xl:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Testimonies Grid - Premium Card Design */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 xl:gap-10">
          {winnersWithTestimonies.map((winner) => {
            const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
            const wonOnDate = new Date(winner.wonOnDate ?? winner.selectedDate);
            const prizeLabel = winner.selectedPrize || winner.prize.name;

            return (
              <div
                key={winner.id}
                className="group relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl sm:rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] shadow-inner border border-gray-700/50 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-all duration-500 overflow-hidden"
              >
                {/* Premium Glow Effect on Hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#ee0000]/0 via-[#ee0000]/0 to-[#ee0000]/0 group-hover:from-[#ee0000]/5 group-hover:via-[#ee0000]/3 group-hover:to-[#ee0000]/5 transition-all duration-500 rounded-2xl sm:rounded-3xl pointer-events-none z-0"></div>

                {/* Logo - Absolutely Positioned at Top Right - Smaller on Mobile */}
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 lg:top-6 lg:right-6 z-20">
                  <div className="relative w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 rounded-full bg-gray-800 p-1 sm:p-1.5 lg:p-2 shadow-inner shadow-white/10">
                    <div className="relative w-full h-full">
                      <Image
                        src="/images/Tools Australia Logo/Social Media Profile_Black Background.png"
                        alt="Tools Australia"
                        fill
                        className="object-contain"
                        sizes="96px"
                      />
                    </div>
                  </div>
                </div>

                {/* Content Section - Compact on Mobile */}
                <div className="relative z-10 p-4 sm:p-6 lg:p-8 xl:p-10">
                  {/* Winner Name - Top Left - Compact on Mobile */}
                  <div className="mb-3 sm:mb-4 lg:mb-6 pr-16 sm:pr-20 lg:pr-24 xl:pr-28">
                    <h3 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-white font-['Poppins'] tracking-tight">
                      {formattedName}
                    </h3>
                  </div>

                  {/* Prize Selected - Below Name - Compact on Mobile */}
                  {winner.selectedPrize && (
                    <div className="mb-3 sm:mb-4 lg:mb-6">
                      <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 lg:px-5 lg:py-2.5 bg-gradient-to-r from-yellow-400/20 via-yellow-500/20 to-yellow-400/20 rounded-lg sm:rounded-xl lg:rounded-2xl border border-yellow-400/40">
                        <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-yellow-400 flex-shrink-0" />
                        <span className="text-xs sm:text-sm lg:text-base xl:text-lg font-bold text-yellow-300 font-['Poppins']">
                          {prizeLabel}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Testimony Text - Below Prize - Compact on Mobile */}
                  <div className="mb-4 sm:mb-5 lg:mb-6 xl:mb-8">
                    <div
                      className="text-sm sm:text-base lg:text-lg xl:text-xl text-white leading-relaxed sm:leading-loose font-['Inter'] prose prose-invert max-w-none prose-sm sm:prose-base"
                      dangerouslySetInnerHTML={{ __html: winner.testimony || "" }}
                      style={{
                        lineHeight: "1.6",
                      }}
                    />
                  </div>

                  {/* Footer: Draw Info and Date - Compact on Mobile */}
                  <div className="pt-3 sm:pt-4 lg:pt-6 border-t border-gray-700/50 flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 xl:gap-6">
                    {/* Draw Name */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-gray-400 flex-shrink-0" />
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-300 font-['Inter']">{winner.drawName}</span>
                    </div>

                    {/* Win Date */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-gray-400 flex-shrink-0" />
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-300 font-['Inter']">
                        {wonOnDate.toLocaleDateString("en-AU", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Location (if available) */}
                    {winner.winnerState && (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] sm:text-xs lg:text-sm text-gray-300 font-['Inter']">{winner.winnerState}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

