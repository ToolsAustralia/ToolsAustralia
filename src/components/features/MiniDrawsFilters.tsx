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

  return (
    <div className="space-y-4">
      {!isMobile && (
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#ee0000]/10 text-[#ee0000]">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Refine Mini Draws</h3>
                <p className="text-xs text-gray-500">{hasActiveFilters ? `${selectedBrands.length} active filter(s)` : "All brands"}</p>
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {(isMobile || hasActiveFilters) && (
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-semibold text-[#ee0000] transition-colors hover:text-[#c70000]"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            placeholder="Search brands..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition-all focus:border-[#ee0000]/40 focus:bg-white focus:ring-2 focus:ring-[#ee0000]/10"
          />
        </div>

        <div className="border-b border-gray-100 pb-3">
          <button
            onClick={() => toggleSection("brands")}
            className="flex w-full items-center justify-between text-left"
          >
            <h4 className="text-sm font-semibold text-gray-900">Brands</h4>
            {expandedSections.brands ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
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
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                      isSelected
                        ? "border-[#ee0000]/35 bg-[#ee0000]/5 text-gray-900 shadow-[0_4px_14px_rgba(238,0,0,0.08)]"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-medium">{brand.name}</span>
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                        isSelected ? "border-[#ee0000] bg-[#ee0000] text-white" : "border-gray-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
                No brands match your search.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
