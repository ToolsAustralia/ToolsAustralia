"use client";

import React from "react";
import {
  Search,
  Loader2,
  Download,
  FileSpreadsheet,
  Package,
  X,
  Filter,
} from "lucide-react";
import Dropdown from "../ui/Dropdown";
import { cn } from "@/utils/cn";

interface PackageOption {
  value: string;
  label: string;
}

interface FilterToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  packageIdFilter: string;
  onPackageIdFilterChange: (value: string) => void;
  packageIdOptions: PackageOption[];
  isFilterDropdownOpen: boolean;
  onFilterDropdownOpenChange: (open: boolean) => void;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  isLoading: boolean;
  hasData: boolean;
  hasFilteredUsers: boolean;
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchQuery,
  onSearchQueryChange,
  packageIdFilter,
  onPackageIdFilterChange,
  packageIdOptions,
  isFilterDropdownOpen,
  onFilterDropdownOpenChange,
  hasActiveFilters,
  onClearAllFilters,
  onExportCSV,
  onExportExcel,
  isLoading,
  hasData,
  hasFilteredUsers,
}) => {
  return (
    <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-800 bg-gradient-to-br from-white via-gray-50 to-white dark:from-neutral-900 dark:via-neutral-900/95 dark:to-neutral-900">
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Search, Filter, and Export Row - All in one row on mobile */}
        <div className="flex flex-row gap-2 items-center">
          {/* Search Input */}
          <div className="relative flex-1 group min-w-0">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-neutral-500 group-focus-within:text-red-600 dark:group-focus-within:text-red-500 transition-colors w-4 h-4 sm:w-5 sm:h-5 z-10" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search..."
              disabled={isLoading}
              className="w-full pl-8 sm:pl-10 pr-8 sm:pr-10 py-2 sm:py-2.5 text-xs sm:text-sm border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 shadow-sm hover:shadow-md transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-neutral-500 disabled:bg-gray-100 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed"
            />
            {isLoading && (
              <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 z-10">
                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-neutral-500 animate-spin" />
              </div>
            )}
          </div>

          {/* Package Filter - Desktop: Dropdown, Mobile: Filter Icon */}
          {/* Desktop: Show Dropdown */}
          <div className="hidden sm:block min-w-[150px] lg:min-w-[180px] flex-shrink-0">
            <Dropdown
              options={[
                { value: "", label: "All Packages", icon: Package },
                ...packageIdOptions,
              ]}
              value={packageIdFilter}
              onChange={(value) => onPackageIdFilterChange(value)}
              placeholder="Package"
              active={!!packageIdFilter}
              compact={true}
            />
          </div>

          {/* Mobile: Filter Icon Button */}
          <div className="sm:hidden relative mobile-filter-container">
            <button
              onClick={() => onFilterDropdownOpenChange(!isFilterDropdownOpen)}
              className={`px-2.5 py-2 border-2 rounded-lg bg-white dark:bg-neutral-900 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md flex-shrink-0 ${
                hasActiveFilters
                  ? "border-red-500 text-red-600"
                  : "border-gray-300 text-gray-600 dark:text-neutral-400 hover:border-red-500"
              }`}
              aria-label="Toggle filter"
            >
              <Filter className={cn("w-4 h-4", hasActiveFilters ? "text-red-600" : "text-gray-600 dark:text-neutral-400")} />
              {hasActiveFilters && <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>}
            </button>

            {/* Mobile Filter Dropdown - Show when icon is clicked */}
            {isFilterDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white dark:bg-neutral-900 border-2 border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg">
                <div className="p-3 border-b border-gray-200 dark:border-neutral-700 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Filter by Package</span>
                  <button
                    onClick={() => onFilterDropdownOpenChange(false)}
                    className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors"
                    aria-label="Close filter"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3">
                  <Dropdown
                    options={[
                      { value: "", label: "All Packages", icon: Package },
                      ...packageIdOptions,
                    ]}
                    value={packageIdFilter}
                    onChange={(value) => {
                      onPackageIdFilterChange(value);
                      onFilterDropdownOpenChange(false);
                    }}
                    placeholder="Select Package"
                    active={!!packageIdFilter}
                    compact={false}
                  />
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        onClearAllFilters();
                        onFilterDropdownOpenChange(false);
                      }}
                      className="mt-3 w-full px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-2 border-red-300 dark:border-red-800 hover:border-red-500 rounded-lg bg-white dark:bg-neutral-900 hover:bg-red-50 dark:hover:bg-red-950/25 transition-all duration-200 flex items-center justify-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      Clear Filter
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Clear Filters Button - Desktop only */}
          {hasActiveFilters && (
            <button
              onClick={onClearAllFilters}
              className="hidden sm:flex px-3 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-2 border-red-300 dark:border-red-800 hover:border-red-500 rounded-lg bg-white dark:bg-neutral-900 hover:bg-red-50 dark:hover:bg-red-600/20 transition-all duration-200 items-center justify-center gap-1.5 shadow-sm hover:shadow-md flex-shrink-0"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
              <span className="hidden lg:inline">Clear Filters</span>
              <span className="lg:hidden">Clear</span>
            </button>
          )}

          {/* Export Buttons */}
          <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={onExportCSV}
              disabled={!hasData || !hasFilteredUsers}
              className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline text-xs sm:text-sm">CSV</span>
            </button>
            <button
              onClick={onExportExcel}
              disabled={!hasData || !hasFilteredUsers}
              className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              title="Export Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline text-xs sm:text-sm">Excel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterToolbar;
