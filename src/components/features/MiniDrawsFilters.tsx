"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";
import { brandLogos } from "@/data/brandLogos";

interface MiniDrawFilterState {
  brands: string[];
}

interface MiniDrawsFiltersProps {
  selectedBrands: string[];
  onFilterChangeAction: (filters: Partial<MiniDrawFilterState>) => void;
  isMobile: boolean;
}

export default function MiniDrawsFilters({
  selectedBrands,
  onFilterChangeAction,
  isMobile,
}: MiniDrawsFiltersProps) {
  const [brandSearch, setBrandSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState({
    brands: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleBrandChange = (brandId: string) => {
    const newBrands = selectedBrands.includes(brandId)
      ? selectedBrands.filter((id) => id !== brandId)
      : [...selectedBrands, brandId];
    onFilterChangeAction({ brands: newBrands });
  };

  const clearAllFilters = () => {
    onFilterChangeAction({ brands: [] });
  };

  const hasActiveFilters = selectedBrands.length > 0;
  const filteredBrands = brandLogos.filter((brand) =>
    brand.name.toLowerCase().includes(brandSearch.toLowerCase().trim())
  );

  const filterButtonClass = (isSelected: boolean) =>
    `flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
      isSelected
        ? "border-[#ee0000]/35 bg-[#ee0000]/5 text-gray-900 shadow-[0_4px_14px_rgba(238,0,0,0.08)] dark:bg-gradient-to-r dark:from-[#ee0000] dark:to-[#ff4444] dark:border-transparent dark:text-white dark:shadow-md"
        : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 text-gray-700 dark:text-neutral-200 hover:border-gray-300 dark:hover:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
    }`;

  const selectionMarkClass = (isSelected: boolean) =>
    `inline-flex h-5 w-5 items-center justify-center rounded-full border ${
      isSelected
        ? "border-[#ee0000] bg-[#ee0000] text-white dark:border-white/30 dark:bg-white/20 dark:text-white"
        : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent"
    }`;

  return (
    <div className="space-y-4">
      {!isMobile && (
        <div className="rounded-2xl border border-gray-200 dark:border-red-900/35 bg-gradient-to-b from-white to-gray-50/80 dark:from-neutral-900 dark:to-neutral-900 p-4 shadow-sm dark:shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#ee0000]/10 text-[#ee0000]">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Refine Mini Draws</h3>
                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  {hasActiveFilters ? `${selectedBrands.length} active filter(s)` : "All brands"}
                </p>
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm dark:shadow-lg">
        {(isMobile || hasActiveFilters) && (
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filters</h3>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-[#ee0000] dark:text-red-400 transition-colors hover:text-[#c70000] dark:hover:text-red-300"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
          <input
            type="text"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            placeholder="Search brands..."
            className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/80 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-neutral-100 outline-none transition-all focus:border-[#ee0000]/40 focus:bg-white dark:focus:bg-neutral-800 focus:ring-2 focus:ring-[#ee0000]/10"
          />
        </div>

        <div className="border-b border-gray-100 dark:border-neutral-800 pb-3">
          <button
            type="button"
            onClick={() => toggleSection("brands")}
            className="flex w-full items-center justify-between rounded-lg px-1 -mx-1 py-1 text-left transition-colors hover:bg-red-50/70 dark:hover:bg-neutral-800"
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Brands</h4>
            {expandedSections.brands ? (
              <ChevronUp className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            )}
          </button>
        </div>

        {expandedSections.brands && (
          <div className="mt-4 space-y-2">
            {filteredBrands.length > 0 ? (
              filteredBrands.map((brand) => {
                const isSelected = selectedBrands.includes(brand.id);
                return (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => handleBrandChange(brand.id)}
                    className={filterButtonClass(isSelected)}
                  >
                    <span className="font-medium">{brand.name}</span>
                    <span className={selectionMarkClass(isSelected)}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/50 px-3 py-6 text-center text-sm text-gray-500 dark:text-neutral-400">
                No brands match your search.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
