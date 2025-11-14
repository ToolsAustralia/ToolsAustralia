"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Filter state interface
interface FilterState {
  category: string[];
  priceRange: [number, number];
  brands: string[];
  styles: string[];
}

interface ProductFiltersProps {
  onFilterChange?: (filters: Partial<FilterState>) => void;
  isMobile?: boolean;
  onClose?: () => void;
}

export default function ProductFilters({ onFilterChange, isMobile = false, onClose }: ProductFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    category: true,
    price: true,
    brands: true,
    style: true,
  });

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    category: [],
    priceRange: [0, 500],
    brands: [],
    styles: [],
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Tool-specific categories for Tools Australia
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

  // Available brands from sample products
  const brands = ["DeWalt", "Makita", "Milwaukee", "Kincrome", "Sidchrome"];
  const styles = ["Professional", "DIY", "Industrial", "Compact", "Heavy Duty"];

  // Handle filter changes
  const handleCategoryChange = (category: string, checked: boolean) => {
    const newCategories = checked ? [...filters.category, category] : filters.category.filter((c) => c !== category);

    const newFilters = { ...filters, category: newCategories };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const handlePriceRangeChange = (min: number, max: number) => {
    // Ensure min doesn't exceed max and vice versa
    const adjustedMin = Math.min(min, max);
    const adjustedMax = Math.max(min, max);

    const newFilters = { ...filters, priceRange: [adjustedMin, adjustedMax] as [number, number] };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const handleBrandChange = (brand: string, checked: boolean) => {
    const newBrands = checked ? [...filters.brands, brand] : filters.brands.filter((b) => b !== brand);

    const newFilters = { ...filters, brands: newBrands };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const handleStyleChange = (style: string, checked: boolean) => {
    const newStyles = checked ? [...filters.styles, style] : filters.styles.filter((s) => s !== style);

    const newFilters = { ...filters, styles: newStyles };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const clearAllFilters = () => {
    const clearedFilters: FilterState = {
      category: [],
      priceRange: [0, 500],
      brands: [],
      styles: [],
    };
    setFilters(clearedFilters);
    onFilterChange?.(clearedFilters);
  };

  return (
    <>
      <style jsx>{`
        .slider-thumb {
          pointer-events: none;
        }

        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #000;
          cursor: pointer;
          border: none;
          box-shadow: none;
          pointer-events: auto;
        }

        .slider-thumb::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #000;
          cursor: pointer;
          border: none;
          box-shadow: none;
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
      <div className={`${isMobile ? "p-4" : "bg-white rounded-lg border border-gray-200 p-6"}`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Filters</h3>
          <button onClick={clearAllFilters} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Clear All
          </button>
        </div>

        {/* Category Filter */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <button
            onClick={() => toggleSection("category")}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="font-medium">Category</span>
            {expandedSections.category ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.category && (
            <div className="mt-3 space-y-2">
              {categories.map((category) => (
                <label key={category} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.category.includes(category)}
                    onChange={(e) => handleCategoryChange(category, e.target.checked)}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-2 focus:ring-red-500/20"
                  />
                  <span className="text-sm text-gray-700">{category}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Price Filter */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <button onClick={() => toggleSection("price")} className="flex items-center justify-between w-full text-left">
            <span className="font-medium">Price</span>
            {expandedSections.price ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.price && (
            <div className="mt-3">
              {/* Price Range Slider */}
              <div className="relative h-2 bg-gray-200 rounded-lg">
                {/* Background track */}
                <div className="absolute inset-0 h-2 bg-gray-200 rounded-lg"></div>

                {/* Active range track */}
                <div
                  className="absolute h-2 bg-black rounded-lg"
                  style={{
                    left: `${(filters.priceRange[0] / 500) * 100}%`,
                    width: `${((filters.priceRange[1] - filters.priceRange[0]) / 500) * 100}%`,
                  }}
                ></div>

                {/* Min slider handle */}
                <input
                  type="range"
                  min="0"
                  max="500"
                  value={filters.priceRange[0]}
                  onChange={(e) => handlePriceRangeChange(Number(e.target.value), filters.priceRange[1])}
                  className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer slider-thumb"
                  style={{ zIndex: 1 }}
                />

                {/* Max slider handle */}
                <input
                  type="range"
                  min="0"
                  max="500"
                  value={filters.priceRange[1]}
                  onChange={(e) => handlePriceRangeChange(filters.priceRange[0], Number(e.target.value))}
                  className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer slider-thumb"
                  style={{ zIndex: 1 }}
                />
              </div>

              <div className="relative mt-2">
                <div
                  className="absolute text-xs text-gray-500 transform -translate-x-1/2"
                  style={{ left: `${(filters.priceRange[0] / 500) * 100}%` }}
                >
                  ${filters.priceRange[0]}
                </div>
                <div
                  className="absolute text-xs text-gray-500 transform -translate-x-1/2"
                  style={{ left: `${(filters.priceRange[1] / 500) * 100}%` }}
                >
                  ${filters.priceRange[1]}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Brands Filter */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <button
            onClick={() => toggleSection("brands")}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="font-medium">Brands</span>
            {expandedSections.brands ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.brands && (
            <div className="mt-3 space-y-2">
              {brands.map((brand) => (
                <label key={brand} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.brands.includes(brand)}
                    onChange={(e) => handleBrandChange(brand, e.target.checked)}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-2 focus:ring-red-500/20"
                  />
                  <span className="text-sm text-gray-700">{brand}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Style Filter */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <button onClick={() => toggleSection("style")} className="flex items-center justify-between w-full text-left">
            <span className="font-medium">Tool Style</span>
            {expandedSections.style ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.style && (
            <div className="mt-3 space-y-2">
              {styles.map((style) => (
                <label key={style} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.styles.includes(style)}
                    onChange={(e) => handleStyleChange(style, e.target.checked)}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-2 focus:ring-red-500/20"
                  />
                  <span className="text-sm text-gray-700">{style}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Active Filters Count */}
        {(() => {
          const activeFiltersCount =
            filters.category.length +
            filters.brands.length +
            filters.styles.length +
            (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0);

          return (
            activeFiltersCount > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">{activeFiltersCount} filter(s) applied</p>
              </div>
            )
          );
        })()}

        {/* Mobile Apply Button */}
        {isMobile && onClose && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full bg-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Apply Filters
            </button>
          </div>
        )}
      </div>
    </>
  );
}
