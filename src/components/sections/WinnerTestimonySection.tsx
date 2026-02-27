"use client";

import React from "react";
import Image from "next/image";
import { MessageSquare, Award, Calendar, Gift, MapPin } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { SectionContainer } from "@/components/ui";

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
      <section className={`py-6 sm:py-8 lg:py-10 bg-gradient-to-br from-gray-50 via-white to-gray-50 ${className}`}>
        <SectionContainer>
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full mb-3">
              <MessageSquare className="w-6 h-6 text-gray-500" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 font-['Poppins'] mb-2">
              Winner Testimonies
            </h2>
            <p className="text-sm sm:text-base text-gray-600 font-['Inter'] max-w-xl mx-auto">
              Check back soon to read inspiring stories from our winners!
            </p>
          </div>
        </SectionContainer>
      </section>
    );
  }

  return (
    <section className={`py-6 sm:py-8 lg:py-10 bg-gradient-to-br from-gray-50 via-white to-gray-50 ${className}`}>
      <SectionContainer>
        {/* Testimonies Grid - Premium Card Design, variable height per card */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-5 items-start">
          {winnersWithTestimonies.map((winner) => {
            const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
            const wonOnDate = new Date(winner.wonOnDate ?? winner.selectedDate);
            const prizeLabel = winner.selectedPrize || winner.prize.name;

            return (
              <div
                key={winner.id}
                className="group relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl sm:rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] shadow-inner border border-gray-700/50 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-all duration-500 overflow-hidden"
              >
                {/* Premium Glow Effect on Hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#ee0000]/0 via-[#ee0000]/0 to-[#ee0000]/0 group-hover:from-[#ee0000]/5 group-hover:via-[#ee0000]/3 group-hover:to-[#ee0000]/5 transition-all duration-500 rounded-xl sm:rounded-2xl pointer-events-none z-0"></div>

                {/* Logo - Absolutely Positioned at Top Right */}
                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20">
                  <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-800 p-0.5 sm:p-1 shadow-inner shadow-white/10">
                    <div className="relative w-full h-full">
                      <Image
                        src="/images/Tools Australia Logo/Social Media Profile_Black Background.png"
                        alt="Tools Australia"
                        fill
                        className="object-contain"
                        sizes="40px"
                      />
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="relative z-10 p-3 sm:p-4 lg:p-5">
                  {/* Winner Name - Top Left */}
                  <div className="mb-2 sm:mb-3 pr-10 sm:pr-12">
                    <h3 className="text-base sm:text-lg lg:text-xl font-bold text-white font-['Poppins'] tracking-tight">
                      {formattedName}
                    </h3>
                  </div>

                  {/* Prize Selected - Below Name */}
                  {winner.selectedPrize && (
                    <div className="mb-2 sm:mb-3">
                      <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-gradient-to-r from-yellow-400/20 via-yellow-500/20 to-yellow-400/20 rounded-md sm:rounded-lg border border-yellow-400/40">
                        <Gift className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 flex-shrink-0" />
                        <span className="text-[10px] sm:text-xs lg:text-sm font-bold text-yellow-300 font-['Poppins']">
                          {prizeLabel}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Testimony Text - Below Prize, height follows content */}
                  <div className="mb-3 sm:mb-4">
                    <div
                      className="text-xs sm:text-sm text-white leading-relaxed font-['Inter'] prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: winner.testimony || "" }}
                      style={{
                        lineHeight: "1.5",
                      }}
                    />
                  </div>

                  {/* Footer: Draw Info and Date */}
                  <div className="pt-2 sm:pt-3 border-t border-gray-700/50 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    {/* Draw Name */}
                    <div className="flex items-center gap-1">
                      <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-[10px] sm:text-xs text-gray-300 font-['Inter']">{winner.drawName}</span>
                    </div>

                    {/* Win Date */}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-[10px] sm:text-xs text-gray-300 font-['Inter']">
                        {wonOnDate.toLocaleDateString("en-AU", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Location (if available) */}
                    {winner.winnerState && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] sm:text-xs text-gray-300 font-['Inter']">{winner.winnerState}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionContainer>
    </section>
  );
}

