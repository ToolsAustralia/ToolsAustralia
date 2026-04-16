"use client";

import Image from "next/image";
import { Trophy, MapPin, Calendar, Award } from "lucide-react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { useMajorDrawWinners } from "@/hooks/queries/useWinnersQueries";

interface WinnersShowcaseProps {
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function WinnersShowcase({
  className = "",
  title = "Major Draw Winners",
  subtitle = "Celebrating our incredible major draw winners and their amazing prizes!",
}: WinnersShowcaseProps) {
  const winnersRef = useScrollAnimation();
  const { data: winners = [], isLoading: loading } = useMajorDrawWinners();
  const theme = usePromoTheme();
  // Show first 8 in grid (same as before); data is shared with homepage/modal cache
  const displayWinners = winners.slice(0, 8);

  const hasWinners = displayWinners.length > 0;

  return (
    <section
      ref={winnersRef}
      className={`py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative ${className}`}
      style={{ ["--winner-card-hover-shadow" as string]: `0 16px 48px ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.3)")}` }}
    >
      {/* Background Pattern Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 pointer-events-none"></div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 50%, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.08)")}, transparent 50%)` }}></div>

      <div className="w-full px-4 sm:px-0 max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl shadow-lg" style={{ background: `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.primary} 50%, ${theme.primaryDark} 100%)` }}>
              <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            {title && (
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white font-sans drop-shadow-lg">
                {title}
              </h2>
            )}
          </div>
          {subtitle && (
            <p className="text-base sm:text-lg text-slate-200 font-['Inter'] max-w-3xl mx-auto leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-slate-700/50 rounded-2xl overflow-hidden border border-slate-600/30 animate-pulse"
              >
                <div className="aspect-square bg-slate-600/50"></div>
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-slate-600/50 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-600/50 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Winners Grid */}
        {!loading && hasWinners && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {displayWinners.map((winner) => {
              const displayImage =
                winner.imageUrl || winner.prize.images[0] || "/images/promotion/PrizeHeader/PrizeHeader.webp";
              const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
              const wonOnDate = new Date(winner.drawDate ?? winner.selectedDate);

              return (
                <div
                  key={winner.id}
                  className="group relative bg-gradient-to-br from-slate-700/90 via-slate-600/90 to-slate-700/90 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-500/40 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:[box-shadow:var(--winner-card-hover-shadow)] transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Shine Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10"></div>

                  {/* Winner Image */}
                  <div className="relative w-full aspect-square bg-gradient-to-br from-slate-600 to-slate-700 overflow-hidden">
                    <Image
                      src={displayImage}
                      alt={`${formattedName} - ${winner.prize.name}`}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                    {/* Gradient Overlay for Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>

                    {/* Prize Value Badge */}
                    {winner.prize.value > 0 && (
                      <div className="absolute top-3 right-3 z-20">
                        <div className="text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg" style={{ background: theme.gradient, border: `1px solid ${theme.borderRgba}` }}>
                          ${winner.prize.value.toLocaleString()}
                        </div>
                      </div>
                    )}

                    {/* Winner Badge - Name and Location Same Row */}
                    <div className="absolute bottom-3 left-3 right-3 z-20">
                      <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/20 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-white font-bold text-sm font-sans">{formattedName}</p>
                        {winner.winnerState && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-300 flex-shrink-0" />
                            <span className="text-xs text-slate-300 font-['Inter']">{winner.winnerState}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 sm:p-5 relative z-10 bg-gradient-to-b from-slate-800/95 to-slate-900/95">
                    {/* Prize Name */}
                    <div className="mb-3">
                      <h3 className="text-sm sm:text-base font-bold text-white font-sans mb-2 line-clamp-2">
                        {winner.prize.name}
                      </h3>
                    </div>

                    {/* Win Date */}
                    <div className="flex items-center gap-2 text-slate-300 mb-3">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs font-['Inter']">
                        {wonOnDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Draw Name Badge */}
                    <div className="rounded-lg p-2" style={{ background: `linear-gradient(to right, ${theme.primary}20, ${theme.primaryDark}20)`, border: `1px solid ${theme.borderRgba}` }}>
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 flex-shrink-0" style={{ color: theme.primary }} />
                        <span className="text-xs font-semibold text-white font-sans line-clamp-1">
                          {winner.drawName}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && !hasWinners && (
          <div className="flex justify-center items-center py-12">
            <div className="relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-w-md w-full">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

              <div className="p-8 sm:p-10 relative z-10 text-center">
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${theme.primaryLight} 0%, ${theme.primary} 50%, ${theme.primaryDark} 100%)` }}>
                    <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                  </div>
                </div>

                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white font-sans mb-4">
                  Are you our next lucky winner?
                </h3>

                <p className="text-sm sm:text-base text-slate-300 font-['Inter'] leading-relaxed">
                  Join thousands of members who are already in the draw. The more entries you have, the better your
                  chances of winning incredible prizes!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
