"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { isEmployeeAccount } from "@/utils/giveaway-eligibility";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Grid,
  List,
  Search,
  Sparkles,
  SlidersHorizontal,
  X,
} from "lucide-react";
import MiniDrawCard, { type MiniDrawCardData } from "./MiniDrawCard";
import MiniDrawsFilters from "./MiniDrawsFilters";
import MiniDrawQuickEnterSheet from "./MiniDrawQuickEnterSheet";
import SheetShell from "@/components/ui/SheetShell";
import { useStickyHeaderOffset } from "@/hooks/useStickyHeaderOffset";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import { type MiniDrawType as ReactQueryMiniDraw } from "@/types/mini-draw";
import { brandLogos } from "@/data/brandLogos";
import { cn } from "@/utils/cn";

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

/**
 * The six brands that get a chip on the mobile rail. Everything else lives one tap away
 * behind `+ More` → the filter sheet, which lists all {@link brandLogos}.
 */
const RAIL_BRAND_IDS = ["sidchrome", "milwaukee", "makita", "kincrome", "dewalt", "knipex"];

/** Anchor the browse-page `ReadyToEnter` block scrolls back to. */
export const MINI_DRAWS_RESULTS_ANCHOR = "mini-draws-results";

const PAGE_SIZE = 12;

interface MiniDrawsContentProps {
  initialMiniDraws: MiniDrawCardData[];
  totalMiniDraws: number;
}

/** Circular check mark shared by the brand rows and the sort options. */
function SelectionMark({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
        on
          ? "border-red-600 bg-red-600 text-white"
          : "border-[#D8DAE0] bg-white text-transparent dark:border-neutral-600 dark:bg-neutral-800"
      )}
    >
      <Check className="h-[11px] w-[11px]" />
    </span>
  );
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
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isDesktopSortOpen, setIsDesktopSortOpen] = useState(false);
  const [quickEnterDrawId, setQuickEnterDrawId] = useState<string | null>(null);

  /** Where the mobile control bar docks — the header's live bottom edge. */
  const { stickyTop } = useStickyHeaderOffset();

  /**
   * Terms §5.5 — employees are ineligible, so an internal account gets no quick-enter sheet.
   * Mirrors the detail page (`MiniDrawInteractions`); `POST /api/mini-draw/purchase` is the gate
   * that actually holds. Staff can reach this page since the 2026-08-20 middleware change.
   */
  const { data: session } = useSession();
  const isStaffViewer = isEmployeeAccount(session?.user?.userType);

  const [sortField, sortOrder] = sortBy.split("-");

  const {
    data: miniDrawsData,
    isLoading,
    error,
    isError,
  } = useMiniDraws({
    page: currentPage,
    limit: PAGE_SIZE,
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

  // Desktop sort is a popover (aria-expanded), NOT a modal — it must not lock scroll, so it
  // closes on outside pointer-down instead of borrowing the sheet machinery.
  const desktopSortRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isDesktopSortOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!desktopSortRef.current?.contains(e.target as Node)) setIsDesktopSortOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isDesktopSortOpen]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilters: Partial<MiniDrawFilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1);
  };

  const toggleBrand = (brandId: string) => {
    handleFilterChange({
      brands: filters.brands.includes(brandId)
        ? filters.brands.filter((id) => id !== brandId)
        : [...filters.brands, brandId],
    });
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setCurrentPage(1);
    setIsSortOpen(false);
    setIsDesktopSortOpen(false);
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
  const hasControlsApplied =
    activeFilterCount > 0 || debouncedSearch.trim().length > 0 || sortBy !== "totalEntries-desc";
  const sortLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? sortOptions[0].label;
  const rangeStart = (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalMiniDraws);
  const resultLabel =
    totalMiniDraws > 0 ? `Showing ${rangeStart}–${rangeEnd} of ${totalMiniDraws}` : "No mini draws found";
  const quickEnterDraw = quickEnterDrawId
    ? transformedMiniDraws.find((d) => d._id === quickEnterDrawId) ?? null
    : null;

  const filterSubLabel =
    activeFilterCount > 0
      ? `${activeFilterCount} brand${activeFilterCount === 1 ? "" : "s"} selected`
      : "All brands";

  const chipClass = (on: boolean) =>
    cn(
      "h-8 shrink-0 whitespace-nowrap rounded-full px-[13px] text-[12.5px] font-semibold transition-all duration-150",
      on
        ? "border border-red-600 bg-red-600 text-white shadow-[0_6px_14px_-8px_rgba(238,0,0,.9)]"
        : "border border-[#E5E7EB] bg-white text-[#374151] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
    );

  const activePills = (compact: boolean) => (
    <>
      {filters.brands.map((brandId) => {
        const brandName = brandLogos.find((brand) => brand.id === brandId)?.name ?? brandId;
        return (
          <button
            key={brandId}
            type="button"
            onClick={() => toggleBrand(brandId)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-red-600/25 bg-red-600/[.06] font-bold text-[#C70000] transition-colors hover:bg-red-600/10 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400",
              compact ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12.5px]"
            )}
          >
            {brandName}
            <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          </button>
        );
      })}
      {compact && (
        <button
          type="button"
          onClick={handleClearAll}
          className="inline-flex h-7 items-center rounded-full border border-[#E5E7EB] bg-white px-2.5 text-[11.5px] font-semibold text-[#6B7280] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
        >
          Reset
        </button>
      )}
    </>
  );

  const viewToggle = (size: "sm" | "lg") => (
    <div
      className={cn(
        "inline-flex items-center rounded-[9px] bg-[#F1F2F5] p-[2px] dark:bg-neutral-800",
        size === "lg" && "rounded-[11px] p-[3px]"
      )}
    >
      {(["grid", "list"] as const).map((mode) => {
        const Icon = mode === "grid" ? Grid : List;
        const on = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            aria-label={`${mode === "grid" ? "Grid" : "List"} view`}
            aria-pressed={on}
            className={cn(
              "flex items-center justify-center rounded-[7px] transition-colors",
              size === "sm" ? "h-[26px] w-[30px]" : "h-8 w-9",
              on ? "bg-[#111827] text-white dark:bg-white dark:text-neutral-900" : "text-[#6B7280]"
            )}
          >
            <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
        );
      })}
    </div>
  );

  const sortList = (
    <div className="flex flex-col">
      {sortOptions.map((option) => {
        const on = option.value === sortBy;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSortChange(option.value)}
            className={cn(
              "flex h-[52px] w-full items-center justify-between gap-2.5 rounded-[14px] px-3.5 transition-colors",
              on ? "bg-red-600/[.05] text-[#C70000] dark:bg-red-950/30 dark:text-red-400" : "text-[#374151] dark:text-neutral-300"
            )}
          >
            <span className="text-[13.5px] font-semibold">{option.label}</span>
            <SelectionMark on={on} />
          </button>
        );
      })}
    </div>
  );

  const cardGrid = (
    <>
      {isLoading ? (
        <div className={cn("grid gap-[11px] lg:gap-5", viewMode === "grid" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-1")}>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-[18px] border border-[#F0F1F4] bg-white dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="aspect-[4/3] bg-gray-200 dark:bg-neutral-800" />
              <div className="space-y-2.5 p-3">
                <div className="h-3 w-16 rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-neutral-800" />
                <div className="mt-3 h-9 w-full rounded-full bg-gray-200 dark:bg-neutral-800" />
              </div>
            </div>
          ))}
        </div>
      ) : transformedMiniDraws.length > 0 ? (
        <div
          className={cn(
            "grid gap-[11px] lg:gap-5",
            viewMode === "grid" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-1 gap-2.5"
          )}
        >
          {transformedMiniDraws.map((miniDraw, index) => (
            <MiniDrawCard
              key={miniDraw._id}
              miniDraw={miniDraw}
              index={index}
              viewMode={viewMode}
              onEnter={isStaffViewer ? undefined : () => setQuickEnterDrawId(miniDraw._id)}
            />
          ))}
        </div>
      ) : (
        <motion.div
          className="flex flex-col items-center gap-2.5 px-8 py-11 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#F3F4F6] text-[#9CA3AF] dark:bg-neutral-800">
            <Sparkles className="h-6 w-6" />
          </span>
          <h3 className="text-[15px] font-bold text-[#111827] dark:text-white">
            {debouncedSearch ? `No mini draws found for "${debouncedSearch}"` : "No mini draws found"}
          </h3>
          <p className="text-[13px] leading-[1.5] text-[#6B7280] dark:text-neutral-400">
            Try a different brand or clear your filters.
          </p>
          {hasControlsApplied && (
            <button
              type="button"
              onClick={handleClearAll}
              className="mt-1 h-[38px] rounded-full bg-[#111827] px-[18px] text-[12.5px] font-bold text-white dark:bg-white dark:text-neutral-900"
            >
              Clear all filters
            </button>
          )}
        </motion.div>
      )}
    </>
  );

  const pagerButtonClass = (disabled: boolean) =>
    cn(
      "h-10 rounded-xl border border-[#E5E7EB] bg-white px-[18px] text-[12.5px] font-semibold text-[#111827] transition-colors dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
      disabled ? "cursor-not-allowed opacity-45" : "hover:bg-gray-50 dark:hover:bg-neutral-800"
    );

  return (
    <div className="w-full">
      {/* ── Mobile sticky control bar (search · filter · sort + brand chip rail) ── */}
      {/*
        `top` is MEASURED, not `var(--app-header-h)`. That constant is a flat 86px, but the
        real header bottom is 85px with the announcement bar up and 60px once it is
        dismissed — so the constant left a transparent 26px strip below the navbar that
        mini-draw cards scrolled up through. `useStickyHeaderOffset` tracks the live edge.
      */}
      <div
        style={{ top: stickyTop }}
        className="sticky z-30 border-b border-[#EDEFF2] bg-white/[.96] shadow-[0_6px_18px_-14px_rgba(15,23,42,.5)] backdrop-blur-md lg:hidden dark:border-neutral-800 dark:bg-neutral-950/95"
      >
        <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-[11px]">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-[11px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search mini draws or prizes"
              aria-label="Search mini draws"
              className="h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] pl-[34px] pr-3 text-[13.5px] text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-red-600/40 focus:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsFiltersOpen(true)}
            aria-label="Open filters"
            className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#374151] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-[5px] -top-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10.5px] font-extrabold text-white dark:border-neutral-950">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsSortOpen(true)}
            aria-label="Sort mini draws"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#374151] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <ArrowUpDown className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex gap-[7px] overflow-x-auto px-3.5 pb-[11px] scrollbar-hide">
          <button type="button" onClick={() => handleFilterChange({ brands: [] })} className={chipClass(activeFilterCount === 0)}>
            All brands
          </button>
          {RAIL_BRAND_IDS.map((id) => {
            const brand = brandLogos.find((b) => b.id === id);
            if (!brand) return null;
            return (
              <button key={id} type="button" onClick={() => toggleBrand(id)} className={chipClass(filters.brands.includes(id))}>
                {brand.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(true)}
            className="h-8 shrink-0 whitespace-nowrap rounded-full border border-dashed border-[#D1D5DB] bg-white px-3 text-[12.5px] font-semibold text-[#6B7280] dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
          >
            + More
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-3.5 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col lg:flex-row lg:gap-8">
          {/* ── Desktop sidebar ── */}
          <aside className="hidden w-80 shrink-0 lg:block">
            <div className="sticky top-24">
              <MiniDrawsFilters
                selectedBrands={filters.brands}
                onFilterChangeAction={handleFilterChange}
                isMobile={false}
              />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {/* ── Desktop control card ── */}
            <div className="mb-5 hidden rounded-[18px] border border-[#EAECEF] bg-white p-5 lg:block dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-end justify-between gap-4 pb-4">
                <div>
                  <h2 className="text-[19px] font-extrabold text-[#111827] dark:text-white">Browse active mini draws</h2>
                  <p className="mt-0.5 text-[13.5px] text-[#6B7280] dark:text-neutral-400">
                    Fine-tune results by brand, sort order, and view mode.
                  </p>
                </div>
                {hasControlsApplied && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-red-300 bg-white px-3.5 text-[12.5px] font-bold text-[#C70000] transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-neutral-900 dark:text-red-400"
                  >
                    <X className="h-[13px] w-[13px]" />
                    Reset controls
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder="Search mini draws or prize names..."
                    aria-label="Search mini draws"
                    className="h-[46px] w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-3.5 text-sm text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-red-600/40 focus:ring-2 focus:ring-red-600/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </div>
                {viewToggle("lg")}
                <div className="relative" ref={desktopSortRef}>
                  <button
                    type="button"
                    onClick={() => setIsDesktopSortOpen((v) => !v)}
                    aria-expanded={isDesktopSortOpen}
                    aria-haspopup="listbox"
                    className="inline-flex h-[46px] items-center gap-2 whitespace-nowrap rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#111827] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    <ArrowUpDown className="h-4 w-4 text-[#6B7280]" />
                    {sortLabel}
                    <ChevronDown className="h-[15px] w-[15px] text-[#9CA3AF]" />
                  </button>
                  {isDesktopSortOpen && (
                    <div className="absolute right-0 top-[52px] z-30 w-[250px] rounded-[14px] border border-[#E5E7EB] bg-white p-1.5 shadow-[0_20px_40px_-18px_rgba(15,23,42,.45)] dark:border-neutral-700 dark:bg-neutral-900">
                      {sortList}
                    </div>
                  )}
                </div>
              </div>

              {activeFilterCount > 0 && <div className="flex flex-wrap gap-2 pt-4">{activePills(false)}</div>}
            </div>

            {/* ── Results row ── */}
            <div id={MINI_DRAWS_RESULTS_ANCHOR} className="flex items-center justify-between gap-2.5 pb-2.5 pt-3.5 lg:pt-0">
              <p className="text-[12.5px] font-medium text-[#6B7280] dark:text-neutral-400 lg:text-[14.5px]">
                {resultLabel}
                {isLoading && (
                  <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-red-600 align-middle" />
                )}
              </p>
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsSortOpen(true)}
                  className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-2.5 text-[11.5px] font-semibold text-[#374151] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  <ArrowUpDown className="h-[13px] w-[13px]" />
                  {sortLabel}
                </button>
                {viewToggle("sm")}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-3 lg:hidden">{activePills(true)}</div>
            )}

            {isError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error instanceof Error ? error.message : "Failed to load mini draws. Please try again."}
                </p>
              </div>
            )}

            <div className="pb-[18px]">{cardGrid}</div>

            {/* ── Pagination — Previous / page-of / Next on mobile, numbered on desktop ── */}
            {totalPages > 1 && (
              <>
                <div className="flex items-center justify-center gap-2.5 pb-6 lg:hidden">
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={pagerButtonClass(currentPage === 1)}
                  >
                    Previous
                  </button>
                  <span className="text-[12.5px] font-semibold text-[#6B7280] dark:text-neutral-400">
                    {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={pagerButtonClass(currentPage === totalPages)}
                  >
                    Next
                  </button>
                </div>

                <div className="hidden items-center justify-center gap-2 lg:flex">
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={pagerButtonClass(currentPage === 1)}
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
                          type="button"
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={cn(
                            "h-10 w-10 rounded-xl text-sm font-semibold transition-colors",
                            pageNum === currentPage
                              ? "bg-[#111827] text-white dark:bg-white dark:text-neutral-900"
                              : "border border-[#E5E7EB] text-[#111827] hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={pagerButtonClass(currentPage === totalPages)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter bottom sheet (mobile) ── */}
      <SheetShell open={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} labelledBy="mini-draw-filters-title">
        <div className="flex items-center justify-between gap-2.5 px-[18px] pb-3 pt-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-red-600/[.09] text-red-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span id="mini-draw-filters-title" className="text-[15px] font-extrabold leading-tight text-[#111827] dark:text-white">
                Filters
              </span>
              <span className="text-[11.5px] text-[#6B7280] dark:text-neutral-400">{filterSubLabel}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsFiltersOpen(false)}
            aria-label="Close filters"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F3F4F6] text-[#4B5563] dark:bg-neutral-800 dark:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <MiniDrawsFilters
          selectedBrands={filters.brands}
          onFilterChangeAction={handleFilterChange}
          isMobile
        />

        {/* Selection applies immediately; this footer only dismisses. */}
        <div className="flex shrink-0 gap-2.5 border-t border-[#F1F2F5] px-[18px] pb-[22px] pt-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => handleFilterChange({ brands: [] })}
            className="h-12 flex-[0_0_34%] rounded-[14px] border border-[#E5E7EB] bg-white text-[13px] font-bold text-[#374151] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setIsFiltersOpen(false)}
            className="h-12 flex-1 rounded-[14px] bg-gradient-to-r from-red-600 to-red-675 text-[13.5px] font-extrabold text-white shadow-[0_12px_22px_-12px_rgba(238,0,0,.9)]"
          >
            Show {totalMiniDraws} {totalMiniDraws === 1 ? "draw" : "draws"}
          </button>
        </div>
      </SheetShell>

      {/* ── Sort bottom sheet (mobile) ── */}
      <SheetShell open={isSortOpen} onClose={() => setIsSortOpen(false)} labelledBy="mini-draw-sort-title">
        <div className="flex items-center justify-between px-[18px] pb-1.5 pt-3">
          <span id="mini-draw-sort-title" className="text-[15px] font-extrabold text-[#111827] dark:text-white">
            Sort by
          </span>
          <button
            type="button"
            onClick={() => setIsSortOpen(false)}
            aria-label="Close sort options"
            className="grid h-8 w-8 place-items-center rounded-full bg-[#F3F4F6] text-[#4B5563] dark:bg-neutral-800 dark:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-3 pb-[26px] pt-1">{sortList}</div>
      </SheetShell>

      {/* ── Quick-enter sheet — mounted per draw so the purchase hook is keyed correctly ── */}
      {quickEnterDraw && (
        <MiniDrawQuickEnterSheet miniDraw={quickEnterDraw} onClose={() => setQuickEnterDrawId(null)} />
      )}
    </div>
  );
}
