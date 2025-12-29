"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Trophy, Calendar, Award, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
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
  entryNumber?: number;
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
          <p className="text-base sm:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed font-['Inter']">
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
                  <ChevronLeft className="w-6 h-6 text-gray-700" />
                </button>
                <button
                  onClick={goToNext}
                  disabled={currentIndex >= maxIndex}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 bg-white rounded-full p-3 shadow-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hidden lg:flex items-center justify-center"
                  aria-label="Next winners"
                >
                  <ChevronRight className="w-6 h-6 text-gray-700" />
                </button>
              </>
            )}

            {/* Winners Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {visibleWinners.map((winner) => {
                const displayImage =
                  winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";
                const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
                const selectedDate = new Date(winner.selectedDate);

                return (
                  <div
                    key={winner.id}
                    className="group bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                  >
                    {/* Winner Image */}
                    <div className="relative h-56 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                      <Image
                        src={displayImage}
                        alt={`${formattedName} - ${winner.prize.name}`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 1024px) 50vw, 33vw"
                      />
                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>

                      {/* Draw Type Badge - Top Left */}
                      <div className="absolute top-3 left-3 z-10">
                        <div
                          className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border ${
                            winner.drawType === "major"
                              ? "bg-gradient-to-r from-[#ee0000] to-red-700 text-white border-red-400/30"
                              : "bg-gradient-to-r from-yellow-400 to-orange-500 text-black border-yellow-300/50"
                          }`}
                        >
                          {winner.drawType === "major" ? "Major Draw" : "Mini Draw"}
                        </div>
                      </div>

                      {/* Prize Value Badge - Top Right */}
                      {winner.prize.value > 0 && (
                        <div className="absolute top-3 right-3 z-10">
                          <div className="bg-gradient-to-r from-[#ee0000] to-red-700 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-red-400/30">
                            ${winner.prize.value.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Winner Name Overlay - Bottom */}
                      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
                        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/20">
                          <p className="text-white font-bold text-base font-['Poppins'] mb-1">{formattedName}</p>
                          {winner.winnerState && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-300" />
                              <span className="text-xs text-gray-300 font-['Inter']">{winner.winnerState}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Winner Information */}
                    <div className="p-6">
                      {/* Prize Name */}
                      <div className="mb-4">
                        <h3 className="text-lg font-bold text-gray-900 font-['Poppins'] mb-2 line-clamp-2">
                          {winner.prize.name}
                        </h3>
                      </div>

                      {/* Prize Information Card */}
                      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-4 border border-red-100 mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Trophy className="w-5 h-5 text-[#ee0000]" />
                          <span className="text-base font-semibold text-gray-900 font-['Poppins']">
                            {winner.drawName}
                          </span>
                        </div>
                        {winner.prize.value > 0 && (
                          <div className="text-sm font-bold text-[#ee0000]">
                            ${winner.prize.value.toLocaleString()} Value
                          </div>
                        )}
                      </div>

                      {/* Win Details */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <span className="text-sm text-gray-600 font-['Inter']">
                            Won on{" "}
                            {selectedDate.toLocaleDateString("en-AU", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
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
            <p className="text-gray-600 font-['Inter']">Check back soon to see our amazing winners!</p>
          </div>
        )}
      </div>
    </section>
  );
}
