"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import ProductCard from "@/components/ui/ProductCard";
import MiniDrawsFilters from "./MiniDrawsFilters";
import { Grid, List, Filter, X, Search } from "lucide-react";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import { type MiniDrawType as ReactQueryMiniDraw } from "@/types/mini-draw";

// Mini draw type for ProductCard compatibility (entry-based system)
interface MiniDrawForCard {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining?: number;
  requiresMembership: boolean;
  hasActiveMembership?: boolean;
  prize: {
    name: string;
    value: number;
    images: string[];
  };
}

// Filter state interface for mini draws
interface MiniDrawFilterState {
  category: string[];
  prizeValueRange: [number, number];
  status: string[]; // active, upcoming, completed
}

// Sort options for mini draws - Updated to match API (entry-based system)
const sortOptions = [
  { value: "createdAt-desc", label: "Newest" },
  { value: "createdAt-asc", label: "Oldest" },
  { value: "prizeValue-desc", label: "Prize Value: High to Low" },
  { value: "prizeValue-asc", label: "Prize Value: Low to High" },
  { value: "totalEntries-desc", label: "Most Entries" },
  { value: "totalEntries-asc", label: "Least Entries" },
  { value: "minimumEntries-asc", label: "Lowest Capacity" },
  { value: "minimumEntries-desc", label: "Highest Capacity" },
];

interface MiniDrawsContentProps {
  initialMiniDraws: MiniDrawForCard[];
  totalMiniDraws: number;
}

export default function MiniDrawsContent({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  initialMiniDraws: _initialMiniDraws,
  totalMiniDraws: initialTotalMiniDraws,
}: MiniDrawsContentProps) {
  const searchParams = useSearchParams();

  // State management for mini draws page
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<MiniDrawFilterState>({
    category: [],
    prizeValueRange: [0, 10000],
    status: [],
  });
  const [sortBy, setSortBy] = useState("createdAt-desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Parse sort parameters
  const [sortField, sortOrder] = sortBy.split("-");

  // Use React Query for data fetching
  const {
    data: miniDrawsData,
    isLoading,
    error,
    isError,
  } = useMiniDraws({
    page: currentPage,
    limit: 12,
    search: debouncedSearch.trim() || undefined,
    minPrice: filters.prizeValueRange[0] > 0 ? filters.prizeValueRange[0] : undefined,
    maxPrice: filters.prizeValueRange[1] < 10000 ? filters.prizeValueRange[1] : undefined,
    status:
      filters.status.length > 0
        ? (filters.status[0] as "active" | "upcoming" | "completed" | "cancelled")
        : undefined,
    sortBy: sortField,
    sortOrder: sortOrder as "asc" | "desc",
  });

  // Transform React Query mini draws to match ProductCard's MiniDrawType interface (entry-based system)
  // NOTE: Mini draws are membership-gated; defaulting to requiresMembership=true keeps UI messaging consistent.
  const transformedMiniDraws: MiniDrawForCard[] =
    miniDrawsData?.miniDraws?.map(
      (
        miniDraw: ReactQueryMiniDraw & {
          requiresMembership?: boolean;
          hasActiveMembership?: boolean;
          entriesRemaining?: number;
        }
      ) => {
        const totalEntries = miniDraw.totalEntries || 0;
        const minimumEntries = miniDraw.minimumEntries || 0;
        const entriesRemaining =
          miniDraw.entriesRemaining !== undefined
            ? miniDraw.entriesRemaining
            : Math.max(minimumEntries - totalEntries, 0);

        return {
      _id: miniDraw._id,
      name: miniDraw.name,
          status: miniDraw.status as "active" | "completed" | "cancelled",
          totalEntries,
          minimumEntries,
          entriesRemaining,
      requiresMembership: miniDraw.requiresMembership ?? true,
      hasActiveMembership: miniDraw.hasActiveMembership ?? false,
      prize: {
        name: miniDraw.prize.name,
        value: miniDraw.prize.value,
        images: miniDraw.prize.images || [],
      },
        };
      }
    ) || [];

  const totalPages = miniDrawsData?.pagination?.totalPages || 1;
  const totalMiniDraws = miniDrawsData?.pagination?.totalCount || initialTotalMiniDraws;

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle URL parameters on component mount
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setFilters((prev) => ({
        ...prev,
        category: [categoryParam],
      }));
    }
  }, [searchParams]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when search changes
  };

  // Note: Mini draws now redirect to detail page via ProductCard, no handler needed

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<MiniDrawFilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Handle closing mobile filters
  const handleCloseFilters = () => {
    setIsFiltersOpen(false);
  };

  // Handle sort change
  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setCurrentPage(1); // Reset to first page when sort changes
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters - Desktop */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <MiniDrawsFilters onFilterChangeAction={handleFilterChange} isMobile={false} />
        </div>

        {/* Mobile/Tablet Filter Overlay */}
        {isFiltersOpen && (
          <div className="fixed inset-0 z-[110] lg:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
              onClick={handleCloseFilters}
            />

            {/* Sidebar */}
            <div className="absolute left-0 top-0 h-full w-80 max-w-[90vw] bg-white shadow-xl overflow-y-auto transform transition-transform duration-300 ease-in-out">
              <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Filters</h3>
                  <button
                    onClick={handleCloseFilters}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Close filters"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <MiniDrawsFilters
                  onFilterChangeAction={handleFilterChange}
                  isMobile={true}
                  onClose={handleCloseFilters}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1">
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search mini draws..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200"
              />
            </div>
          </div>

          {/* Results Header */}
          <div className="flex flex-col gap-4 mb-8">
            {/* Results count and loading */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="text-gray-600 text-sm sm:text-base">
                  {totalMiniDraws > 0 ? (
                    <>
                      Showing {(currentPage - 1) * 12 + 1}-{Math.min(currentPage * 12, totalMiniDraws)} of{" "}
                      {totalMiniDraws} Mini Draws
                    </>
                  ) : (
                    "No mini draws found"
                  )}
                </p>
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
                )}
              </div>
            </div>

            {/* Error message */}
            {isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-600 text-sm">
                  {error instanceof Error ? error.message : "Failed to load mini draws. Please try again."}
                </p>
              </div>
            )}

            {/* Controls row */}
            <div className="flex items-center justify-between">
              {/* Filters Button - Mobile/Tablet only */}
              <div className="lg:hidden">
                <button
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span className="text-xs">Filters</span>
                  <span className="text-xs text-gray-500">
                    {(() => {
                      const activeFiltersCount =
                        filters.category.length +
                        filters.status.length +
                        (filters.prizeValueRange[0] > 0 || filters.prizeValueRange[1] < 10000 ? 1 : 0);
                      return activeFiltersCount > 0 ? `(${activeFiltersCount})` : "";
                    })()}
                  </span>
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 transition-colors ${
                    viewMode === "grid" ? "bg-black text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  aria-label="Grid view"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 transition-colors ${
                    viewMode === "list" ? "bg-black text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  aria-label="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1">
                <span className="text-gray-600 text-xs">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200 min-w-[120px]"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Mini Draws Grid/List */}
          {isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 lg:gap-6 mb-12">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-[25px] shadow-[0px_4px_10px_0px_rgba(0,0,0,0.1)] p-4 sm:p-6 animate-pulse"
                >
                  <div className="h-[150px] sm:h-[196px] bg-gray-200 rounded-[10px] mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : transformedMiniDraws.length > 0 ? (
            <div
              className={`grid gap-2 sm:gap-4 lg:gap-6 mb-12 ${
                viewMode === "grid"
                  ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1"
              }`}
            >
              {transformedMiniDraws.map((miniDraw) => (
                <ProductCard
                  key={miniDraw._id}
                  product={miniDraw}
                  width="w-full"
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {debouncedSearch ? `No mini draws found for "${debouncedSearch}"` : "No mini draws found"}
              </h3>
              <p className="text-gray-600 mb-4">
                {debouncedSearch
                  ? "Try searching for something else or adjust your filters."
                  : "Try adjusting your filters to see more results."}
              </p>
              {debouncedSearch && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Suggestions:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => setSearchQuery("")}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition-colors"
                    >
                      Clear search
                    </button>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setFilters({
                          category: [],
                          prizeValueRange: [0, 10000],
                          status: [],
                        });
                      }}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition-colors"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Mobile pagination */}
              <div className="flex sm:hidden items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-gray-600">
                  {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>

              {/* Desktop pagination */}
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                <div className="flex gap-1">
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (currentPage <= 4) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = currentPage - 3 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-10 h-10 rounded-lg transition-colors ${
                          pageNum === currentPage ? "bg-black text-white" : "border border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

