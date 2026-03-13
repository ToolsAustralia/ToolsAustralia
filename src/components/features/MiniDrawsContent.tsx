"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import MiniDrawCard, { type MiniDrawCardData } from "./MiniDrawCard";
import MiniDrawsFilters from "./MiniDrawsFilters";
import { Grid, List, Filter, X, Search, Sparkles, ArrowUpDown } from "lucide-react";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import { type MiniDrawType as ReactQueryMiniDraw } from "@/types/mini-draw";
import { SectionContainer } from "@/components/ui";
import { AnimatePresence, motion } from "framer-motion";
import { brandLogos } from "@/data/brandLogos";
import Dropdown from "@/components/modals/ui/Dropdown";

interface MiniDrawFilterState {
  brands: string[];
}

const sortOptions = [
  { value: "totalEntries-desc", label: "Most Entries" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "totalEntries-asc", label: "Fewest Entries" },
  { value: "minimumEntries-asc", label: "Lowest Entry Target" },
  { value: "minimumEntries-desc", label: "Highest Entry Target" },
];

interface MiniDrawsContentProps {
  initialMiniDraws: MiniDrawCardData[];
  totalMiniDraws: number;
}

export default function MiniDrawsContent({
  initialMiniDraws: _initialMiniDraws,
  totalMiniDraws: initialTotalMiniDraws,
}: MiniDrawsContentProps) {
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<MiniDrawFilterState>({ brands: [] });
  const [sortBy, setSortBy] = useState("totalEntries-desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [sortField, sortOrder] = sortBy.split("-");

  const {
    data: miniDrawsData,
    isLoading,
    error,
    isError,
  } = useMiniDraws({
    page: currentPage,
    limit: 12,
    search: debouncedSearch.trim() || undefined,
    brandIds: filters.brands.length > 0 ? filters.brands.join(",") : undefined,
    sortBy: sortField,
    sortOrder: sortOrder as "asc" | "desc",
  });

  const transformedMiniDraws: MiniDrawCardData[] =
    miniDrawsData?.miniDraws?.map(
      (
        miniDraw: ReactQueryMiniDraw & {
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
          brandId: miniDraw.brandId,
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const brandParam = searchParams.get("brandId");
    if (brandParam) {
      setFilters((prev) => ({ ...prev, brands: [brandParam] }));
    }
  }, [searchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilters: Partial<MiniDrawFilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1);
  };

  const handleCloseFilters = () => {
    setIsFiltersOpen(false);
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setCurrentPage(1);
  };

  const handleClearAll = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setFilters({ brands: [] });
    setSortBy("totalEntries-desc");
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeFilterCount = filters.brands.length;
  const hasControlsApplied = activeFilterCount > 0 || debouncedSearch.trim().length > 0 || sortBy !== "totalEntries-desc";

  return (
    <SectionContainer className="py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters - Desktop */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <MiniDrawsFilters
            selectedBrands={filters.brands}
            onFilterChangeAction={handleFilterChange}
            isMobile={false}
          />
        </div>

        {/* Mobile/Tablet Filter Overlay */}
        <AnimatePresence>
          {isFiltersOpen && (
            <div className="fixed inset-0 z-[110] lg:hidden">
              <motion.div
                className="absolute inset-0 bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseFilters}
              />
              <motion.div
                className="absolute left-0 top-0 h-full w-80 max-w-[90vw] bg-white shadow-xl overflow-y-auto"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
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
                    selectedBrands={filters.brands}
                    onFilterChangeAction={handleFilterChange}
                    isMobile={true}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex-1">
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 sm:text-lg">Browse Active Mini Draws</h2>
                <p className="text-xs text-gray-500 sm:text-sm">
                  Fine-tune results by brand, sort order, and view mode.
                </p>
              </div>
              {hasControlsApplied && (
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Reset controls
                </button>
              )}
            </div>

            <div className="space-y-3 md:hidden">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search mini draws or prize names..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-800 outline-none transition-all duration-200 focus:border-[#ee0000]/40 focus:ring-2 focus:ring-[#ee0000]/10"
                  />
                </div>

                <button
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-[#ee0000]/10 px-1.5 py-0.5 text-xs font-semibold text-[#ee0000]">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex shrink-0 items-center rounded-xl border border-gray-300 bg-white p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                    aria-label="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative min-w-0 flex-1">
                  <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500">
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                  <Dropdown
                    options={sortOptions}
                    value={sortBy}
                    onChange={handleSortChange}
                    placeholder="Sort by"
                    className="[&>button]:h-[42px] [&>button]:rounded-xl [&>button]:border-gray-300 [&>button]:pl-9 [&>button]:pr-8 [&>button]:text-sm [&>button]:font-medium [&>button]:text-gray-800 [&>button]:focus:ring-[#ee0000]/10"
                  />
                </div>
              </div>
            </div>

            <div className="hidden gap-3 md:grid md:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search mini draws or prize names..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-800 outline-none transition-all duration-200 focus:border-[#ee0000]/40 focus:ring-2 focus:ring-[#ee0000]/10"
                />
              </div>

              <div className="lg:hidden">
                <button
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="inline-flex h-[42px] items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-[#ee0000]/10 px-1.5 py-0.5 text-xs font-semibold text-[#ee0000]">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="inline-flex items-center rounded-xl border border-gray-300 bg-white p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  aria-label="Grid view"
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <div className="relative min-w-[190px]">
                <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500">
                  <ArrowUpDown className="h-4 w-4" />
                </div>
                <Dropdown
                  options={sortOptions}
                  value={sortBy}
                  onChange={handleSortChange}
                  placeholder="Sort by"
                  className="[&>button]:h-[42px] [&>button]:rounded-xl [&>button]:border-gray-300 [&>button]:pl-9 [&>button]:pr-8 [&>button]:text-sm [&>button]:font-medium [&>button]:text-gray-800 [&>button]:focus:ring-[#ee0000]/10"
                />
              </div>
            </div>

            {(activeFilterCount > 0 || debouncedSearch.trim().length > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {debouncedSearch.trim().length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                    Search: &quot;{debouncedSearch}&quot;
                  </span>
                )}
                {filters.brands.map((brandId) => {
                  const brandName = brandLogos.find((brand) => brand.id === brandId)?.name ?? brandId;
                  return (
                    <button
                      key={brandId}
                      onClick={() =>
                        handleFilterChange({
                          brands: filters.brands.filter((id) => id !== brandId),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#ee0000]/25 bg-[#ee0000]/5 px-3 py-1 text-xs font-semibold text-[#c70000] transition-colors hover:bg-[#ee0000]/10"
                    >
                      {brandName}
                      <X className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Results Header */}
          <div className="flex flex-col gap-4 mb-6">
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
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-[#ee0000] rounded-full animate-spin" />
                )}
              </div>
            </div>

            {isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">
                  {error instanceof Error ? error.message : "Failed to load mini draws. Please try again."}
                </p>
              </div>
            )}

          </div>

          {/* Mini Draws Grid/List */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-12">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-gray-200" />
                  <div className="p-3 sm:p-4 space-y-2.5">
                    <div className="h-3 bg-gray-200 rounded w-16" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-1.5 bg-gray-200 rounded-full w-full" />
                    <div className="h-9 bg-gray-200 rounded-full w-full mt-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : transformedMiniDraws.length > 0 ? (
            <div
              className={`grid gap-3 sm:gap-4 lg:gap-6 mb-12 ${
                viewMode === "grid"
                  ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-1 lg:grid-cols-1"
              }`}
            >
              {transformedMiniDraws.map((miniDraw, index) => (
                <MiniDrawCard
                  key={miniDraw._id}
                  miniDraw={miniDraw}
                  index={index}
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : (
            <motion.div
              className="text-center py-16"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-gray-400" />
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
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => setSearchQuery("")}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm font-medium transition-colors"
                  >
                    Clear search
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilters({ brands: [] });
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm font-medium transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </motion.div>
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
                        className={`w-10 h-10 rounded-lg transition-colors text-sm font-medium ${
                          pageNum === currentPage
                            ? "bg-gray-900 text-white"
                            : "border border-gray-300 hover:bg-gray-50"
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
    </SectionContainer>
  );
}
