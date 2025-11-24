"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { brandLogos } from "@/data/brandLogos";

interface MiniDrawFilterState {
  brands: string[];
}

interface MiniDrawsFiltersProps {
  onFilterChangeAction: (filters: Partial<MiniDrawFilterState>) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function MiniDrawsFilters({ onFilterChangeAction, isMobile, onClose }: MiniDrawsFiltersProps) {
  const [filters, setFilters] = useState<MiniDrawFilterState>({
    brands: [],
  });

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
    const newBrands = filters.brands.includes(brandId)
      ? filters.brands.filter((id) => id !== brandId)
      : [...filters.brands, brandId];

    const newFilters = { ...filters, brands: newBrands };
    setFilters(newFilters);
    onFilterChangeAction(newFilters);
  };

  const clearAllFilters = () => {
    const clearedFilters: MiniDrawFilterState = {
      brands: [],
    };
    setFilters(clearedFilters);
    onFilterChangeAction(clearedFilters);
  };

  const hasActiveFilters = filters.brands.length > 0;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="text-sm text-red-600 hover:text-red-700 transition-colors">
              Clear All
            </button>
          )}
        </div>

        {/* Brand Filter */}
        <div className="border-b border-gray-200 pb-4">
          <button
            onClick={() => toggleSection("brands")}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="font-medium text-gray-900">Brands</h4>
            {expandedSections.brands ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {expandedSections.brands && (
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
              {brandLogos.map((brand) => (
                <label key={brand.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.brands.includes(brand.id)}
                    onChange={() => handleBrandChange(brand.id)}
                    className="rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500/20"
                  />
                  <span className="ml-2 text-sm text-gray-700">{brand.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Mobile Apply Button */}
        {isMobile && onClose && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        )}
      </div>
    </>
  );
}
