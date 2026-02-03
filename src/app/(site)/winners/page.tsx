"use client";

import { useEffect, useState } from "react";
import { Trophy, Sparkles } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import MembershipSection from "@/components/sections/MembershipSection";
import WinnerCard, { type WinnerCardData } from "@/components/cards/WinnerCard";
import WinnerFilterToggle from "@/components/filters/WinnerFilterToggle";
import WinnerTestimonySection from "@/components/sections/WinnerTestimonySection";

// Use WinnerCardData type from WinnerCard component
type Winner = WinnerCardData;

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
            <div className="inline-flex items-center gap-2 sm:gap-3 mb-2 sm:mb-6">
              <div className="p-1.5 sm:p-4 bg-gradient-to-br from-[#ee0000] to-red-700 rounded-lg sm:rounded-xl shadow-lg">
                <Trophy className="w-5 h-5 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white" />
              </div>
              <h1 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-white font-['Poppins']">
                Winners Hall of Fame
              </h1>
            </div>
            <p className="text-xs sm:text-base lg:text-lg xl:text-xl text-slate-200 font-['Inter'] max-w-3xl mx-auto px-2">
              Celebrating all our incredible winners and their amazing achievements
            </p>
          </div>
        </div>
      </section>

      {/* Filters and Search - Elevated Design */}
      <section className="bg-white border-b border-gray-200 sticky top-[60px] sm:top-[70px] z-30 shadow-lg">
        <div className="w-full sm:max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-4">
          <div className="flex flex-row sm:flex-row gap-1 sm:gap-4 items-center justify-between">
            {/* Filter Toggle - Premium Styling - Larger on Mobile */}
            <div className="flex-[1.2] sm:flex-initial sm:w-auto min-w-0">
              <WinnerFilterToggle selectedFilter={filter} onFilterChange={setFilter} className="w-full sm:w-auto" />
            </div>

            {/* Results Count - Between Filter and Search on Desktop */}
            <div className="hidden sm:block flex-1 text-center text-sm text-gray-600 font-['Inter'] font-medium whitespace-nowrap">
              Showing {filteredWinners.length} of {winners.length} winners
            </div>

            {/* Search - Reduced Width on Mobile */}
            <div className="relative flex-1 sm:flex-initial sm:min-w-[300px] max-w-[200px] sm:max-w-none">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full py-1.5 pl-2 sm:pl-4 sm:py-2.5 text-xs sm:text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ee0000] focus:border-[#ee0000] font-['Inter'] bg-gray-50 focus:bg-white transition-all duration-200"
                />
            </div>
          </div>

          {/* Results Count - Mobile Only */}
          <div className="mt-2 sm:hidden text-xs text-gray-600 font-['Inter'] font-medium">
            Showing {filteredWinners.length} of {winners.length} winners
          </div>
        </div>
      </section>

      {/* Winners Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
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
          <>
            {/* Special messaging for single winner (inaugural winner) */}
            {filteredWinners.length === 1 && !searchQuery && filter === "all" && (
              <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 mb-3 px-4 py-2 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-full border border-yellow-200">
                  <Sparkles className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-semibold text-yellow-800">Our Inaugural Winner</span>
                </div>
                <p className="text-gray-600 font-['Inter'] max-w-2xl mx-auto">
                  We&apos;re thrilled to celebrate our first winner! This is just the beginning of many amazing winners to come.
                </p>
              </div>
            )}

            {/* Winners Grid - Centered for single winner, normal grid for multiple */}
            <div
              className={`grid gap-4 sm:gap-6 lg:gap-8 ${
                filteredWinners.length === 1 && !searchQuery && filter === "all"
                  ? "grid-cols-1 max-w-2xl mx-auto"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {filteredWinners.map((winner) => (
                <WinnerCard key={winner.id} winner={winner} />
              ))}
            </div>
          </>
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

      {/* Testimony Section - Display below winners grid */}
      {!loading && winners.length > 0 && (
        <WinnerTestimonySection winners={winners} />
      )}

      {/* Membership Section - Be Our Next Winner */}
      <section className="bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <MembershipSection
            title="BE OUR NEXT WINNER"
            padding="pb-28 sm:pb-36"
            titleColor="text-gray-900"
          />
        </div>
      </section>

     
    </div>
  );
}
