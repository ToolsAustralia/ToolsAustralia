"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trophy, MapPin, Calendar, Award, Filter, Search } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import MembershipSection from "@/components/sections/MembershipSection";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

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

type FilterType = "all" | "major" | "mini";

export default function WinnersPage() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [filteredWinners, setFilteredWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchWinners();
  }, []);

  useEffect(() => {
    let filtered = winners;

    // Apply filter
    if (filter !== "all") {
      filtered = filtered.filter((winner) => winner.drawType === filter);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (winner) =>
          winner.prize.name.toLowerCase().includes(query) ||
          winner.drawName.toLowerCase().includes(query) ||
          formatWinnerName(winner.winnerFirstName, winner.winnerLastName).toLowerCase().includes(query) ||
          winner.winnerState?.toLowerCase().includes(query)
      );
    }

    setFilteredWinners(filtered);
  }, [winners, filter, searchQuery]);

  const fetchWinners = async () => {
    try {
      const response = await fetch("/api/winners/all?limit=100");
      const data = await response.json();

      if (data.success && data.winners) {
        setWinners(data.winners);
        setFilteredWinners(data.winners);
      }
    } catch (error) {
      console.error("Error fetching winners:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-50 pt-[60px] sm:pt-[70px]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-6 sm:py-12 lg:py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 pointer-events-none"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(238,0,0,0.15),transparent_50%)] pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
              <div className="p-2 sm:p-4 bg-gradient-to-br from-[#ee0000] to-red-700 rounded-lg sm:rounded-xl shadow-lg">
                <Trophy className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-white font-['Poppins']">
                Winners Hall of Fame
              </h1>
            </div>
            <p className="text-sm sm:text-base lg:text-lg xl:text-xl text-slate-200 font-['Inter'] max-w-3xl mx-auto px-2">
              Celebrating all our incredible winners and their amazing achievements
            </p>
          </div>
        </div>
      </section>

      {/* Filters and Search */}
      <section className="bg-white border-b border-gray-200 sticky top-[60px] sm:top-[70px] z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
              <Filter className="w-4 h-4 text-gray-600 ml-2" />
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  filter === "all"
                    ? "bg-white text-[#ee0000] shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All Winners
              </button>
              <button
                onClick={() => setFilter("major")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  filter === "major"
                    ? "bg-white text-[#ee0000] shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Major Draws
              </button>
              <button
                onClick={() => setFilter("mini")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  filter === "mini"
                    ? "bg-white text-[#ee0000] shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Mini Draws
              </button>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-auto sm:min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search winners, prizes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ee0000] focus:border-transparent font-['Inter']"
              />
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-4 text-sm text-gray-600 font-['Inter']">
            Showing {filteredWinners.length} of {winners.length} winners
          </div>
        </div>
      </section>

      {/* Winners Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-pulse"
              >
                <div className="h-64 bg-gray-200"></div>
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredWinners.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {filteredWinners.map((winner) => {
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
                  <div className="relative h-64 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                    <Image
                      src={displayImage}
                      alt={`${formattedName} - ${winner.prize.name}`}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 1024px) 50vw, 33vw"
                    />
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>

                    {/* Draw Type Badge */}
                    <div className="absolute top-4 left-4 z-10">
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


                    {/* Winner Name Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
                      <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/20">
                        <p className="text-white font-bold text-lg font-['Poppins'] mb-1">{formattedName}</p>
                        {winner.winnerState && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4 text-gray-300" />
                            <span className="text-sm text-gray-300 font-['Inter']">{winner.winnerState}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Winner Information */}
                  <div className="p-6">
                    {/* Prize Name */}
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 font-['Poppins'] mb-2 sm:mb-3 line-clamp-2">
                      {winner.prize.name}
                    </h3>

                    {/* Draw Information */}
                    <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-4 border border-red-100 mb-4">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-[#ee0000]" />
                        <span className="text-base font-semibold text-gray-900 font-['Poppins']">
                          {winner.drawName}
                        </span>
                      </div>
                    </div>

                    {/* Win Details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="text-sm text-gray-600 font-['Inter']">
                          {selectedDate.toLocaleDateString("en-AU", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* View Details Link */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <Link
                        href={winner.drawType === "major" ? `/promotions/${DEFAULT_PRIZE_SLUG}` : `/mini-draws/${winner.drawId}`}
                        className="text-[#ee0000] hover:text-red-700 text-sm font-semibold font-['Poppins'] flex items-center gap-1"
                      >
                        {winner.drawType === "major" ? "View Promotions" : "View Draw Details"}
                        <span>→</span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full mb-4">
              <Trophy className="w-10 h-10 text-gray-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 font-['Poppins'] mb-2">No Winners Found</h3>
            <p className="text-gray-600 font-['Inter']">
              {searchQuery || filter !== "all"
                ? "Try adjusting your filters or search terms"
                : "Check back soon to see our amazing winners!"}
            </p>
          </div>
        )}
      </section>

      {/* Membership Section - Be Our Next Winner */}
      <section className="bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <MembershipSection
          title="BE OUR NEXT WINNER"
          padding="py-12 sm:py-16 lg:py-20"
          titleColor="text-gray-900"
        />
      </section>
    </div>
  );
}
