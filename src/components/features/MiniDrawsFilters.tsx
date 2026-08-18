"use client";

import { useState } from "react";
import { Check, Search, SlidersHorizontal } from "lucide-react";
import { brandLogos } from "@/data/brandLogos";
import { cn } from "@/utils/cn";

interface MiniDrawFilterState {
  brands: string[];
}

interface MiniDrawsFiltersProps {
  selectedBrands: string[];
  onFilterChangeAction: (filters: Partial<MiniDrawFilterState>) => void;
  /**
   * `true` renders the bottom-sheet body (search pinned, 2-column scrolling brand grid) as a
   * FRAGMENT — the sheet chrome (handle, header, sticky "Show N draws" footer) belongs to
   * `MiniDrawsContent`, which is the only component that knows the live result count.
   * `false` renders the desktop sidebar card stack.
   */
  isMobile: boolean;
}

export default function MiniDrawsFilters({
  selectedBrands,
  onFilterChangeAction,
  isMobile,
}: MiniDrawsFiltersProps) {
  const [brandSearch, setBrandSearch] = useState("");

  const handleBrandChange = (brandId: string) => {
    const newBrands = selectedBrands.includes(brandId)
      ? selectedBrands.filter((id) => id !== brandId)
      : [...selectedBrands, brandId];
    onFilterChangeAction({ brands: newBrands });
  };

  const clearAllFilters = () => onFilterChangeAction({ brands: [] });

  const hasActiveFilters = selectedBrands.length > 0;
  const filteredBrands = brandLogos.filter((brand) =>
    brand.name.toLowerCase().includes(brandSearch.toLowerCase().trim())
  );
  const subLabel = hasActiveFilters
    ? `${selectedBrands.length} brand${selectedBrands.length === 1 ? "" : "s"} selected`
    : "All brands";

  const brandRow = (brandId: string, brandName: string) => {
    const isSelected = selectedBrands.includes(brandId);
    return (
      <button
        key={brandId}
        type="button"
        onClick={() => handleBrandChange(brandId)}
        aria-pressed={isSelected}
        className={cn(
          "flex min-h-[52px] w-full items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 text-left transition-all",
          isSelected
            ? "border-red-600/40 bg-red-600/[.05] shadow-[0_6px_16px_-12px_rgba(238,0,0,.9)] dark:border-red-500/50 dark:bg-red-950/30"
            : "border-[#E9EAEE] bg-white hover:border-[#D8DAE0] dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
        )}
      >
        <span className="text-[12.5px] font-semibold leading-[1.25] text-[#111827] dark:text-white sm:text-[13.5px]">
          {brandName}
        </span>
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            isSelected
              ? "border-red-600 bg-red-600 text-white"
              : "border-[#D8DAE0] bg-white text-transparent dark:border-neutral-600 dark:bg-neutral-800"
          )}
        >
          <Check className="h-[11px] w-[11px]" />
        </span>
      </button>
    );
  };

  const searchField = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[#9CA3AF]" />
      <input
        type="text"
        value={brandSearch}
        onChange={(e) => setBrandSearch(e.target.value)}
        placeholder="Search brands…"
        className="h-[42px] w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] pl-[34px] pr-3 text-[13.5px] text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-red-600/40 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-800 lg:h-11 lg:pl-9 lg:text-sm"
      />
    </div>
  );

  const emptyState = (
    <div className="rounded-[14px] border border-dashed border-[#D1D5DB] bg-[#FAFAFB] p-[22px] text-center text-[12.5px] text-[#6B7280] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
      No brands match your search.
    </div>
  );

  /* ── Mobile: bottom-sheet body ── */
  if (isMobile) {
    return (
      <>
        <div className="shrink-0 px-[18px] pb-3">{searchField}</div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-3.5">
          <div className="flex items-center justify-between pb-2.5 pt-0.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#111827] dark:text-white">
              Brands
            </span>
            <span className="text-[11.5px] font-medium text-[#9CA3AF]">{brandLogos.length} brands</span>
          </div>
          {filteredBrands.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {filteredBrands.map((brand) => brandRow(brand.id, brand.name))}
            </div>
          ) : (
            emptyState
          )}
        </div>
      </>
    );
  }

  /* ── Desktop: sidebar card stack ── */
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[18px] border border-[#EAECEF] bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-red-600/[.09] text-red-600">
          <SlidersHorizontal className="h-[18px] w-[18px]" />
        </span>
        <span className="flex flex-col">
          <span className="text-[14.5px] font-bold text-[#111827] dark:text-white">Refine mini draws</span>
          <span className="text-[12.5px] text-[#6B7280] dark:text-neutral-400">{subLabel}</span>
        </span>
      </div>

      <div className="flex flex-col gap-3.5 rounded-[18px] border border-[#EAECEF] bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {searchField}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#111827] dark:text-white">Brands</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[12.5px] font-bold text-red-600 transition-colors hover:text-red-675"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex max-h-[430px] flex-col gap-2 overflow-y-auto overscroll-contain brand-scrollbar">
          {filteredBrands.length > 0 ? filteredBrands.map((brand) => brandRow(brand.id, brand.name)) : emptyState}
        </div>
      </div>
    </div>
  );
}
