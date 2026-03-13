"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";

interface FilterState {
  category: string[];
  priceRange: [number, number];
  brands: string[];
  styles: string[];
}

interface ProductFiltersProps {
  selectedFilters: FilterState;
  onFilterChange?: (filters: Partial<FilterState>) => void;
  isMobile?: boolean;
}

const categories = [
  "Power Tools",
  "Hand Tools",
  "Safety Equipment",
  "Measuring Tools",
  "Cutting Tools",
  "Fastening Tools",
  "Automotive Tools",
  "Garden Tools",
];

const brands = ["DeWalt", "Makita", "Milwaukee", "Kincrome", "Sidchrome"];
const styles = ["Professional", "DIY", "Industrial", "Compact", "Heavy Duty"];
const MIN_PRICE = 0;
const MAX_PRICE = 500;

export default function ProductFilters({ selectedFilters, onFilterChange, isMobile = false }: ProductFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    category: true,
    price: true,
    brands: true,
    style: true,
  });
  const [categorySearch, setCategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [styleSearch, setStyleSearch] = useState("");

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleCategoryToggle = (category: string) => {
    const newCategories = selectedFilters.category.includes(category)
      ? selectedFilters.category.filter((c) => c !== category)
      : [...selectedFilters.category, category];
    onFilterChange?.({ category: newCategories });
  };

  const handleBrandToggle = (brand: string) => {
    const newBrands = selectedFilters.brands.includes(brand)
      ? selectedFilters.brands.filter((b) => b !== brand)
      : [...selectedFilters.brands, brand];
    onFilterChange?.({ brands: newBrands });
  };

  const handleStyleToggle = (style: string) => {
    const newStyles = selectedFilters.styles.includes(style)
      ? selectedFilters.styles.filter((s) => s !== style)
      : [...selectedFilters.styles, style];
    onFilterChange?.({ styles: newStyles });
  };

  const handlePriceRangeChange = (min: number, max: number) => {
    const boundedMin = Math.max(MIN_PRICE, Math.min(min, MAX_PRICE));
    const boundedMax = Math.max(MIN_PRICE, Math.min(max, MAX_PRICE));
    const adjustedMin = Math.min(boundedMin, boundedMax);
    const adjustedMax = Math.max(boundedMin, boundedMax);
    onFilterChange?.({ priceRange: [adjustedMin, adjustedMax] });
  };

  const clearAllFilters = () => {
    onFilterChange?.({
      category: [],
      priceRange: [MIN_PRICE, MAX_PRICE],
      brands: [],
      styles: [],
    });
  };

  const activeFiltersCount =
    selectedFilters.category.length +
    selectedFilters.brands.length +
    selectedFilters.styles.length +
    (selectedFilters.priceRange[0] > MIN_PRICE || selectedFilters.priceRange[1] < MAX_PRICE ? 1 : 0);
  const hasActiveFilters = activeFiltersCount > 0;

  const filteredCategories = useMemo(
    () => categories.filter((item) => item.toLowerCase().includes(categorySearch.toLowerCase().trim())),
    [categorySearch]
  );
  const filteredBrands = useMemo(
    () => brands.filter((item) => item.toLowerCase().includes(brandSearch.toLowerCase().trim())),
    [brandSearch]
  );
  const filteredStyles = useMemo(
    () => styles.filter((item) => item.toLowerCase().includes(styleSearch.toLowerCase().trim())),
    [styleSearch]
  );

  const filterButtonClass = (isSelected: boolean) =>
    `flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
      isSelected
        ? "border-[#ee0000]/35 bg-[#ee0000]/5 text-gray-900 shadow-[0_4px_14px_rgba(238,0,0,0.08)]"
        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
    }`;

  const selectionMarkClass = (isSelected: boolean) =>
    `inline-flex h-5 w-5 items-center justify-center rounded-full border ${
      isSelected ? "border-[#ee0000] bg-[#ee0000] text-white" : "border-gray-300 bg-white text-transparent"
    }`;

  return (
    <div className="space-y-4">
      <style jsx>{`
        .slider-thumb {
          pointer-events: none;
        }

        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ee0000;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 4px 12px rgba(238, 0, 0, 0.28);
          pointer-events: auto;
        }

        .slider-thumb::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ee0000;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 4px 12px rgba(238, 0, 0, 0.28);
          pointer-events: auto;
        }

        .slider-thumb::-webkit-slider-track {
          background: transparent;
          height: 2px;
          pointer-events: none;
        }

        .slider-thumb::-moz-range-track {
          background: transparent;
          height: 2px;
          pointer-events: none;
        }
      `}</style>

      {!isMobile && (
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#ee0000]/10 text-[#ee0000]">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Refine Products</h3>
                <p className="text-xs text-gray-500">
                  {hasActiveFilters ? `${activeFiltersCount} active filter(s)` : "All products"}
                </p>
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

        <div className="mb-4 border-b border-gray-100 pb-3">
          <button onClick={() => toggleSection("category")} className="flex w-full items-center justify-between text-left">
            <span className="text-sm font-semibold text-gray-900">Category</span>
            {expandedSections.category ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {expandedSections.category && (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition-all focus:border-[#ee0000]/40 focus:bg-white focus:ring-2 focus:ring-[#ee0000]/10"
                />
              </div>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((category) => {
                  const isSelected = selectedFilters.category.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleCategoryToggle(category)}
                      className={filterButtonClass(isSelected)}
                    >
                      <span className="font-medium">{category}</span>
                      <span className={selectionMarkClass(isSelected)}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                  No categories match your search.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 border-b border-gray-100 pb-3">
          <button onClick={() => toggleSection("price")} className="flex w-full items-center justify-between text-left">
            <span className="text-sm font-semibold text-gray-900">Price Range</span>
            {expandedSections.price ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {expandedSections.price && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Min</label>
                  <input
                    type="number"
                    min={MIN_PRICE}
                    max={MAX_PRICE}
                    value={selectedFilters.priceRange[0]}
                    onChange={(e) => handlePriceRangeChange(Number(e.target.value), selectedFilters.priceRange[1])}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-all focus:border-[#ee0000]/40 focus:ring-2 focus:ring-[#ee0000]/10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Max</label>
                  <input
                    type="number"
                    min={MIN_PRICE}
                    max={MAX_PRICE}
                    value={selectedFilters.priceRange[1]}
                    onChange={(e) => handlePriceRangeChange(selectedFilters.priceRange[0], Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-all focus:border-[#ee0000]/40 focus:ring-2 focus:ring-[#ee0000]/10"
                  />
                </div>
              </div>
              <div className="relative h-2 rounded-full bg-gray-200">
                <div
                  className="absolute h-2 rounded-full bg-gradient-to-r from-[#ee0000] to-[#c70000]"
                  style={{
                    left: `${(selectedFilters.priceRange[0] / MAX_PRICE) * 100}%`,
                    width: `${((selectedFilters.priceRange[1] - selectedFilters.priceRange[0]) / MAX_PRICE) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={MIN_PRICE}
                  max={MAX_PRICE}
                  value={selectedFilters.priceRange[0]}
                  onChange={(e) => handlePriceRangeChange(Number(e.target.value), selectedFilters.priceRange[1])}
                  className="slider-thumb absolute h-2 w-full cursor-pointer appearance-none bg-transparent"
                />
                <input
                  type="range"
                  min={MIN_PRICE}
                  max={MAX_PRICE}
                  value={selectedFilters.priceRange[1]}
                  onChange={(e) => handlePriceRangeChange(selectedFilters.priceRange[0], Number(e.target.value))}
                  className="slider-thumb absolute h-2 w-full cursor-pointer appearance-none bg-transparent"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 border-b border-gray-100 pb-3">
          <button onClick={() => toggleSection("brands")} className="flex w-full items-center justify-between text-left">
            <span className="text-sm font-semibold text-gray-900">Brands</span>
            {expandedSections.brands ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {expandedSections.brands && (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Search brands..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition-all focus:border-[#ee0000]/40 focus:bg-white focus:ring-2 focus:ring-[#ee0000]/10"
                />
              </div>
              {filteredBrands.length > 0 ? (
                filteredBrands.map((brand) => {
                  const isSelected = selectedFilters.brands.includes(brand);
                  return (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => handleBrandToggle(brand)}
                      className={filterButtonClass(isSelected)}
                    >
                      <span className="font-medium">{brand}</span>
                      <span className={selectionMarkClass(isSelected)}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                  No brands match your search.
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <button onClick={() => toggleSection("style")} className="flex w-full items-center justify-between text-left">
            <span className="text-sm font-semibold text-gray-900">Tool Style</span>
            {expandedSections.style ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {expandedSections.style && (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={styleSearch}
                  onChange={(e) => setStyleSearch(e.target.value)}
                  placeholder="Search styles..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition-all focus:border-[#ee0000]/40 focus:bg-white focus:ring-2 focus:ring-[#ee0000]/10"
                />
              </div>
              {filteredStyles.length > 0 ? (
                filteredStyles.map((style) => {
                  const isSelected = selectedFilters.styles.includes(style);
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() => handleStyleToggle(style)}
                      className={filterButtonClass(isSelected)}
                    >
                      <span className="font-medium">{style}</span>
                      <span className={selectionMarkClass(isSelected)}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                  No styles match your search.
                </div>
              )}
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">{activeFiltersCount} filter(s) applied</p>
          </div>
        )}
      </div>
    </div>
  );
}
