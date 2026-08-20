"use client";

import { useMemo, useState } from "react";
import { useShopFacets } from "@/hooks/queries/useProductQueries";
import { Check, ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";
import sliderStyles from "./product-filters.module.css";

interface FilterState {
  category: string[];
  priceRange: [number, number];
  brands: string[];
  /** Apparel sizes (variants[].size) — replaced the meaningless "Tool Style" facet. */
  sizes: string[];
  /** Apparel colours (variants[].colour). */
  colours: string[];
}

interface ProductFiltersProps {
  selectedFilters: FilterState;
  onFilterChange?: (filters: Partial<FilterState>) => void;
  isMobile?: boolean;
}

/*
 * Facets are DERIVED from the catalogue (useShopFacets -> /api/products/categories),
 * never hard-coded.
 *
 * This file used to declare eight tool categories, five tool brands and a "Tool
 * Style" list (Professional / DIY / Industrial / Compact / Heavy Duty) as literal
 * arrays with no connection to any product. The shop sells apparel — tools are
 * PRIZES, not stock — so every one of those facets returned zero results, while the
 * two things a merchandise shopper actually filters by, size and colour, were absent.
 *
 * "Tool Style" is replaced by Size and Colour, both read from variants[].
 */
const MIN_PRICE = 0;
const MAX_PRICE = 500;

export default function ProductFilters({ selectedFilters, onFilterChange, isMobile = false }: ProductFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    category: true,
    price: true,
    brands: true,
    size: true,
    colour: true,
  });
  const [categorySearch, setCategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");

  // Derived from the catalogue. While loading these are empty, so each section shows
  // its own empty state rather than a stale hard-coded list.
  const { data: facets } = useShopFacets();
  const categories = useMemo(() => (facets?.categories ?? []).map((c) => c.name), [facets]);
  const brands = useMemo(() => (facets?.brands ?? []).map((b) => b.name), [facets]);

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
      sizes: [],
      colours: [],
    });
  };

  const activeFiltersCount =
    selectedFilters.category.length +
    selectedFilters.brands.length +
    selectedFilters.sizes.length +
    selectedFilters.colours.length +
    (selectedFilters.priceRange[0] > MIN_PRICE || selectedFilters.priceRange[1] < MAX_PRICE ? 1 : 0);
  const hasActiveFilters = activeFiltersCount > 0;

  const filteredCategories = useMemo(
    () => categories.filter((item) => item.toLowerCase().includes(categorySearch.toLowerCase().trim())),
    [categories, categorySearch]
  );
  const filteredBrands = useMemo(
    () => brands.filter((item) => item.toLowerCase().includes(brandSearch.toLowerCase().trim())),
    [brands, brandSearch]
  );

  const filterButtonClass = (isSelected: boolean) =>
    `flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
      isSelected
        ? "border-red-600/35 bg-red-600/5 text-gray-900 dark:bg-gradient-to-r dark:from-red-600 dark:to-red-400 dark:border-transparent dark:text-white shadow-[0_4px_14px_rgba(238,0,0,0.08)] dark:shadow-md"
        : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/70 text-gray-700 dark:text-neutral-200 hover:border-gray-300 dark:hover:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
    }`;

  const selectionMarkClass = (isSelected: boolean) =>
    `inline-flex h-5 w-5 items-center justify-center rounded-full border ${
      isSelected
        ? "border-red-600 bg-red-600 text-white dark:border-white/30 dark:bg-white/20 dark:text-white"
        : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent"
    }`;

  return (
    <div className="space-y-4">
      {!isMobile && (
        <div className="rounded-2xl border border-gray-200 dark:border-red-900/35 bg-gradient-to-b from-white to-gray-50/80 dark:from-neutral-900 dark:to-neutral-900 p-4 shadow-sm dark:shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 text-red-600">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Refine Products</h3>
                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  {hasActiveFilters ? `${activeFiltersCount} active filter(s)` : "All products"}
                </p>
              </div>
            </div>
            {hasActiveFilters && (
              <button
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
                onClick={clearAllFilters}
                className="text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:text-[#c70000] dark:hover:text-red-300"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        <div className="mb-4 border-b border-gray-100 dark:border-neutral-800 pb-3">
          <button
            type="button"
            onClick={() => toggleSection("category")}
            className="flex w-full items-center justify-between rounded-lg px-1 -mx-1 py-1 text-left transition-colors hover:bg-red-50/70 dark:hover:bg-neutral-800"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Category</span>
            {expandedSections.category ? (
              <ChevronUp className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
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
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-950 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-neutral-100 outline-none transition-all focus:border-red-600/40 focus:bg-white dark:focus:bg-neutral-900 focus:ring-2 focus:ring-red-600/10"
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
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/50 px-3 py-4 text-center text-sm text-gray-500 dark:text-neutral-400">
                  No categories match your search.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 border-b border-gray-100 dark:border-neutral-800 pb-3">
          <button
            type="button"
            onClick={() => toggleSection("price")}
            className="flex w-full items-center justify-between rounded-lg px-1 -mx-1 py-1 text-left transition-colors hover:bg-red-50/70 dark:hover:bg-neutral-800"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Price Range</span>
            {expandedSections.price ? (
              <ChevronUp className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            )}
          </button>
          {expandedSections.price && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">Min</label>
                  <input
                    type="number"
                    min={MIN_PRICE}
                    max={MAX_PRICE}
                    value={selectedFilters.priceRange[0]}
                    onChange={(e) => handlePriceRangeChange(Number(e.target.value), selectedFilters.priceRange[1])}
                    className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 px-3 py-2 text-sm text-gray-800 dark:text-neutral-100 outline-none transition-all focus:border-red-600/40 focus:ring-2 focus:ring-red-600/10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">Max</label>
                  <input
                    type="number"
                    min={MIN_PRICE}
                    max={MAX_PRICE}
                    value={selectedFilters.priceRange[1]}
                    onChange={(e) => handlePriceRangeChange(selectedFilters.priceRange[0], Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 px-3 py-2 text-sm text-gray-800 dark:text-neutral-100 outline-none transition-all focus:border-red-600/40 focus:ring-2 focus:ring-red-600/10"
                  />
                </div>
              </div>
              <div className="relative h-2 rounded-full bg-gray-200 dark:bg-neutral-700">
                <div
                  className="absolute h-2 rounded-full bg-gradient-to-r from-red-600 to-[#c70000]"
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
                  className={`${sliderStyles.sliderThumb} absolute h-2 w-full cursor-pointer appearance-none bg-transparent`}
                />
                <input
                  type="range"
                  min={MIN_PRICE}
                  max={MAX_PRICE}
                  value={selectedFilters.priceRange[1]}
                  onChange={(e) => handlePriceRangeChange(selectedFilters.priceRange[0], Number(e.target.value))}
                  className={`${sliderStyles.sliderThumb} absolute h-2 w-full cursor-pointer appearance-none bg-transparent`}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 border-b border-gray-100 dark:border-neutral-800 pb-3">
          <button
            type="button"
            onClick={() => toggleSection("brands")}
            className="flex w-full items-center justify-between rounded-lg px-1 -mx-1 py-1 text-left transition-colors hover:bg-red-50/70 dark:hover:bg-neutral-800"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Brands</span>
            {expandedSections.brands ? (
              <ChevronUp className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
            )}
          </button>
          {expandedSections.brands && (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  type="text"
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Search brands..."
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/80 py-2.5 pl-9 pr-3 text-sm text-gray-800 dark:text-neutral-100 outline-none transition-all focus:border-red-600/40 focus:bg-white dark:focus:bg-neutral-800 focus:ring-2 focus:ring-red-600/10"
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
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/50 px-3 py-4 text-center text-sm text-gray-500 dark:text-neutral-400">
                  No brands match your search.
                </div>
              )}
            </div>
          )}
        </div>

        {/*
          SIZE AND COLOUR ARE DELIBERATELY NOT FILTERABLE HERE (2026-08-20).

          They were, and they read as a reasonable apparel facet — but they
          describe a VARIANT, not a product, and this rail filters products. A
          shopper picking "Black" was shown every garment that happens to be sold
          in black, then still had to choose black again on the product page,
          because the colour is chosen there from the variant picker.

          Worse on this catalogue specifically: one tee carries 383 variants across
          51 colours, so the colour list was longer than the product list it
          filtered and matched almost everything in it.

          The API still accepts ?size= and ?colour= — the $elemMatch filter is
          correct and a future surface (a colour swatch rail on the product page,
          say) may want it. Only the rail here is removed.
        */}
        {hasActiveFilters && (
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 p-3">
            <p className="text-sm text-gray-600 dark:text-neutral-400">{activeFiltersCount} filter(s) applied</p>
          </div>
        )}
      </div>
    </div>
  );
}
