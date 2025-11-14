"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface MiniDrawFilterState {
  category: string[];
  prizeValueRange: [number, number];
  status: string[];
}

interface MiniDrawsFiltersProps {
  onFilterChangeAction: (filters: Partial<MiniDrawFilterState>) => void;
  isMobile: boolean;
  onClose?: () => void;
}

export default function MiniDrawsFilters({ onFilterChangeAction, isMobile, onClose }: MiniDrawsFiltersProps) {
  const [filters, setFilters] = useState<MiniDrawFilterState>({
    category: [],
    prizeValueRange: [0, 10000],
    status: [],
  });

  const [expandedSections, setExpandedSections] = useState({
    category: true,
    prizeValue: true,
    status: true,
  });

  // Mini draw categories
  const categories = [
    "Power Tools",
    "Hand Tools",
    "Safety Equipment",
    "Cordless Tools",
    "Automotive",
    "Garden Tools",
    "Accessories",
    "Measurement Tools",
  ];

  // Status options
  const statusOptions = [
    { value: "active", label: "Active Draws", color: "text-green-600" },
    { value: "upcoming", label: "Upcoming Draws", color: "text-blue-600" },
    { value: "completed", label: "Completed Draws", color: "text-gray-600" },
  ];

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleCategoryChange = (category: string) => {
    const newCategories = filters.category.includes(category)
      ? filters.category.filter((c) => c !== category)
      : [...filters.category, category];

    const newFilters = { ...filters, category: newCategories };
    setFilters(newFilters);
    onFilterChangeAction(newFilters);
  };

  const handleStatusChange = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];

    const newFilters = { ...filters, status: newStatus };
    setFilters(newFilters);
    onFilterChangeAction(newFilters);
  };

  const handlePrizeValueChange = (min: number, max: number) => {
    // Ensure min doesn't exceed max and vice versa
    const adjustedMin = Math.min(min, max);
    const adjustedMax = Math.max(min, max);

    const newFilters = { ...filters, prizeValueRange: [adjustedMin, adjustedMax] as [number, number] };
    setFilters(newFilters);
    onFilterChangeAction(newFilters);
  };

  const clearAllFilters = () => {
    const clearedFilters: MiniDrawFilterState = {
      category: [],
      prizeValueRange: [0, 10000],
      status: [],
    };
    setFilters(clearedFilters);
    onFilterChangeAction(clearedFilters);
  };

  const hasActiveFilters =
    filters.category.length > 0 ||
    filters.status.length > 0 ||
    filters.prizeValueRange[0] > 0 ||
    filters.prizeValueRange[1] < 10000;

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
          background: #dc2626;
          cursor: pointer;
          border: none;
          box-shadow: none;
          pointer-events: auto;
        }

        .slider-thumb::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #dc2626;
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

        {/* Status Filter */}
        <div className="border-b border-gray-200 pb-4">
          <button
            onClick={() => toggleSection("status")}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="font-medium text-gray-900">Status</h4>
            {expandedSections.status ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {expandedSections.status && (
            <div className="mt-3 space-y-2">
              {statusOptions.map((status) => (
                <label key={status.value} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.status.includes(status.value)}
                    onChange={() => handleStatusChange(status.value)}
                    className="rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500/20"
                  />
                  <span className={`ml-2 text-sm ${status.color}`}>{status.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Category Filter */}
        <div className="border-b border-gray-200 pb-4">
          <button
            onClick={() => toggleSection("category")}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="font-medium text-gray-900">Category</h4>
            {expandedSections.category ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {expandedSections.category && (
            <div className="mt-3 space-y-2">
              {categories.map((category) => (
                <label key={category} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.category.includes(category)}
                    onChange={() => handleCategoryChange(category)}
                    className="rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500/20"
                  />
                  <span className="ml-2 text-sm text-gray-700">{category}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Prize Value Range */}
        <div className="border-b border-gray-200 pb-4">
          <button
            onClick={() => toggleSection("prizeValue")}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="font-medium text-gray-900">Prize Value</h4>
            {expandedSections.prizeValue ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {expandedSections.prizeValue && (
            <div className="mt-3">
              {/* Prize Value Range Slider */}
              <div className="relative h-2 bg-gray-200 rounded-lg">
                {/* Background track */}
                <div className="absolute inset-0 h-2 bg-gray-200 rounded-lg"></div>

                {/* Active range track */}
                <div
                  className="absolute h-2 bg-red-600 rounded-lg"
                  style={{
                    left: `${(filters.prizeValueRange[0] / 10000) * 100}%`,
                    width: `${((filters.prizeValueRange[1] - filters.prizeValueRange[0]) / 10000) * 100}%`,
                  }}
                ></div>

                {/* Min slider handle */}
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="100"
                  value={filters.prizeValueRange[0]}
                  onChange={(e) => handlePrizeValueChange(Number(e.target.value), filters.prizeValueRange[1])}
                  className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer slider-thumb"
                  style={{ zIndex: 1 }}
                />

                {/* Max slider handle */}
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="100"
                  value={filters.prizeValueRange[1]}
                  onChange={(e) => handlePrizeValueChange(filters.prizeValueRange[0], Number(e.target.value))}
                  className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer slider-thumb"
                  style={{ zIndex: 1 }}
                />
              </div>

              <div className="relative mt-2">
                <div
                  className="absolute text-xs text-gray-500 transform -translate-x-1/2"
                  style={{ left: `${(filters.prizeValueRange[0] / 10000) * 100}%` }}
                >
                  ${filters.prizeValueRange[0].toLocaleString()}
                </div>
                <div
                  className="absolute text-xs text-gray-500 transform -translate-x-1/2"
                  style={{ left: `${(filters.prizeValueRange[1] / 10000) * 100}%` }}
                >
                  ${filters.prizeValueRange[1].toLocaleString()}
                </div>
              </div>
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

