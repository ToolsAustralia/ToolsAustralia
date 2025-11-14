"use client";

import { Trophy, MapPin, Calendar, Star } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

interface Winner {
  id: string;
  name: string;
  location: string;
  prize: string;
  prizeValue?: number;
  winDate: string;
  testimonial?: string;
}

interface WinnersShowcaseProps {
  className?: string;
  title?: string;
  subtitle?: string;
  winners?: Winner[];
}

export default function WinnersShowcase({ className = "", title, subtitle, winners = [] }: WinnersShowcaseProps) {
  const winnersRef = useScrollAnimation();

  // Check if we have winners to display
  const hasWinners = winners && winners.length > 0;

  return (
    <section
      ref={winnersRef}
      className={`py-8 sm:py-12 lg:py-16 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 relative ${className}`}
    >
      {/* Metallic shine overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 pointer-events-none"></div>
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        {/* Section Header - Only show if we have winners or if title/subtitle are provided */}
        {(hasWinners || title || subtitle) && (
          <div className="text-center mb-8 sm:mb-12">
            {title && (
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white font-['Poppins'] mb-3 sm:mb-4 drop-shadow-lg">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-base sm:text-lg text-slate-200 font-['Inter'] max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>
        )}

        {/* Conditional Rendering: Winners Grid or Placeholder Card */}
        {hasWinners ? (
          /* Winners Grid - Display when we have winners */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 stagger-animation">
            {winners.map((winner) => (
              <div
                key={winner.id}
                className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)] transition-all duration-300"
              >
                {/* Metallic shine overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

                {/* Winner Image Placeholder */}
                <div className="relative w-full aspect-square bg-gradient-to-br from-slate-600 to-slate-700">
                  {/* Placeholder for winner photo - will be replaced with actual images */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Trophy className="w-16 h-16 text-slate-400/40" />
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-2 sm:p-4 relative z-10">
                  {/* Winner Name & Location */}
                  <h3 className="text-sm sm:text-base font-bold text-white font-['Poppins'] mb-1">{winner.name}</h3>
                  <div className="flex items-center gap-1 text-slate-300 mb-1 sm:mb-2">
                    <MapPin className="w-2 h-2 sm:w-3 sm:h-3" />
                    <span className="text-[10px] sm:text-xs font-['Inter']">{winner.location}</span>
                  </div>

                  {/* Win Date */}
                  <div className="flex items-center gap-1 text-slate-400 mb-2 sm:mb-3">
                    <Calendar className="w-2 h-2 sm:w-3 sm:h-3" />
                    <span className="text-[10px] sm:text-xs font-['Inter']">
                      {new Date(winner.winDate).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Prize Name */}
                  <div className="bg-gradient-to-r from-red-600/20 to-red-700/20 rounded-lg p-1.5 sm:p-2 border border-red-500/30">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Trophy className="w-3 h-3 sm:w-4 sm:h-4 text-red-400" />
                      <span className="text-xs sm:text-sm font-semibold text-white font-['Poppins']">
                        {winner.prize}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Placeholder Card - Display when there are no winners */
          <div className="flex justify-center items-center">
            <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)] transition-all duration-300 max-w-md w-full">
              {/* Metallic shine overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

              {/* Card Content */}
              <div className="p-6 sm:p-8 relative z-10 text-center">
                {/* Trophy Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                    <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                  </div>
                </div>

                {/* Main Question */}
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white font-['Poppins'] mb-3 sm:mb-4">
                  Are you our next lucky winner?
                </h3>

                {/* Encouraging Text */}
                <p className="text-sm sm:text-base text-slate-300 font-['Inter'] mb-4 sm:mb-6 leading-relaxed">
                  Join thousands of members who are already in the draw. The more entries you have, the better your
                  chances of winning incredible prizes!
                </p>

                {/* Star Icon Accent */}
                <div className="flex justify-center">
                  <Star className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
