"use client";

import React from "react";
import { Trophy, Calendar, Users, Gift, Award } from "lucide-react";
import Image from "next/image";
// import MajorDrawStats from "@/components/sections/MajorDrawStats"; // Commented out for now
import { useCompletedMajorDraws } from "@/hooks/queries/useMajorDrawQueries";

// Winner interface - not currently used but kept for future reference
// interface Winner {
//   name: string;
//   state?: string;
//   email: string;
//   entryNumber: number;
//   selectedDate: string;
//   notified: boolean;
//   selectionMethod?: "manual" | "government-app";
//   selectedBy?: string;
// }

interface CompletedDrawsSectionProps {
  className?: string;
}

const CompletedDrawsSection: React.FC<CompletedDrawsSectionProps> = ({ className = "" }) => {
  const { data: completedDrawsData, isLoading, error } = useCompletedMajorDraws();

  const completedDraws = completedDrawsData?.draws || [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(value);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "vehicle":
        return "🚗";
      case "electronics":
        return "📱";
      case "travel":
        return "✈️";
      case "cash":
        return "💰";
      case "experience":
        return "🎯";
      case "home":
        return "🏠";
      case "fashion":
        return "👕";
      case "sports":
        return "⚽";
      default:
        return "🎁";
    }
  };

  if (isLoading) {
    return (
      <section className={`bg-white rounded-2xl shadow-sm border border-gray-200/50 p-6 sm:p-8 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={`bg-white rounded-2xl shadow-sm border border-gray-200/50 p-6 sm:p-8 ${className}`}>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </section>
    );
  }

  if (completedDraws.length === 0) {
    return (
      <section className={`bg-white rounded-2xl shadow-sm border border-gray-200/50 p-6 sm:p-8 ${className}`}>
        <div className="text-center py-12">
          <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Completed Draws Yet</h3>
          <p className="text-gray-600">Check back soon for completed major draw results!</p>
        </div>
      </section>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Major Draw Stats Overlay - Commented out for now */}
      {/* <MajorDrawStats className="-top-[130px] sm:-top-[150px]" /> */}

      {/* Header Section */}
      <div className="text-center  sm:mb-12 mt-18 sm:mt-8">
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-gray-900 via-red-600 to-gray-900 bg-clip-text text-transparent font-['Poppins'] mb-2 sm:mb-4">
          Completed Major Draws
        </h2>
      </div>

      <div className="space-y-4 sm:space-y-8">
        {completedDraws.map((draw, index) => (
          <div
            key={draw._id}
            className="group relative bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-gray-200/50 p-4 sm:p-8 hover:shadow-xl sm:hover:shadow-2xl hover:scale-[1.01] sm:hover:scale-[1.02] transition-all duration-500 overflow-hidden"
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-50/20 via-transparent to-red-50/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
                {/* Prize Image with Winner - Responsive */}
                <div className="lg:col-span-1">
                  <div className="relative">
                    {draw.prize.images && draw.prize.images.length > 0 ? (
                      <div className="relative w-full h-48 sm:h-64 lg:h-80 rounded-xl sm:rounded-2xl overflow-hidden shadow-lg sm:shadow-xl group-hover:shadow-xl sm:group-hover:shadow-2xl transition-shadow duration-500">
                        <Image
                          src={draw.prize.images[0]}
                          alt={draw.prize.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                      </div>
                    ) : (
                      <div className="w-full h-48 sm:h-64 lg:h-80 bg-gradient-to-br from-red-100 via-red-200 to-red-300 rounded-xl sm:rounded-2xl flex items-center justify-center text-4xl sm:text-6xl shadow-lg sm:shadow-xl">
                        {getCategoryIcon(draw.prize.category)}
                      </div>
                    )}

                    {/* Prize Value Badge */}
                    <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-2 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl shadow-lg">
                      <span className="text-sm sm:text-lg font-bold">{formatCurrency(draw.prize.value)}</span>
                    </div>

                    {/* Winner Information - Bottom of Image (All Screen Sizes) */}
                    {draw.winner && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-3 sm:p-4 rounded-b-xl sm:rounded-b-2xl">
                        <div className="text-white">
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                            <span className="text-xs sm:text-sm font-semibold text-red-400">Winner</span>
                          </div>
                          <p className="text-base sm:text-lg font-bold mb-1">{draw.winner.name}</p>
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span>Entry #{draw.winner.entryNumber}</span>
                            <span>{formatDate(draw.winner.selectedDate)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Draw Information */}
                <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                  <div>
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <span className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-1 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-lg">
                        ✓ Completed
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500 font-medium">
                        Draw #{completedDraws.length - index}
                      </span>
                    </div>

                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 font-['Poppins'] mb-2 sm:mb-3 leading-tight">
                      {draw.name}
                    </h3>

                    <p className="text-gray-600 text-sm sm:text-base lg:text-lg leading-relaxed mb-4 sm:mb-6">
                      {draw.description}
                    </p>

                    {/* Draw Stats */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Drawn</span>
                        </div>
                        <p className="text-sm sm:text-lg font-bold text-gray-900">{formatDate(draw.drawDate)}</p>
                      </div>
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Participants</span>
                        </div>
                        <p className="text-sm sm:text-lg font-bold text-gray-900">
                          {draw.participantCount.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Total Entries</span>
                        </div>
                        <p className="text-sm sm:text-lg font-bold text-gray-900">
                          {draw.totalEntries.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Category</span>
                        </div>
                        <p className="text-sm sm:text-lg font-bold text-gray-900 capitalize">{draw.prize.category}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompletedDrawsSection;
