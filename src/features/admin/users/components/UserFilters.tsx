/**
 * User Filters Component
 * Handles search and filtering UI for user list
 */

import React from "react";
import { Search, X } from "lucide-react";
import type { UserFilters } from "@/types/admin";
import { membershipPackages } from "@/data/membershipPackages";

interface UserFiltersProps {
  filters: UserFilters;
  onFilterChange: (key: keyof UserFilters, value: string | number) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * Filters component for user management
 * Displays search bar and filter dropdowns
 */
export default function UserFiltersComponent({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
}: UserFiltersProps) {
  // Get unique membership packages for filter dropdown
  const membershipPackageOptions = membershipPackages
    .filter((pkg) => pkg.isActive && pkg.type === "subscription")
    .map((pkg) => pkg.name)
    .sort();

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-2.5 sm:p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 lg:gap-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
          <input
            type="text"
            placeholder="Search users..."
            value={filters.search || ""}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="w-full pl-7 sm:pl-9 lg:pl-10 pr-2 sm:pr-4 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base"
          />
        </div>

        {/* Filters - In Same Row */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 lg:gap-3">
          {/* Subscription Status Filter */}
          <select
            value={filters.subscriptionStatus || ""}
            onChange={(e) => onFilterChange("subscriptionStatus", e.target.value)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base bg-white min-w-[100px] sm:min-w-[120px] lg:min-w-[140px]"
          >
            <option value="">Subscriptions</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="none">No Subscription</option>
          </select>

          {/* Membership Package Filter */}
          <select
            value={filters.membershipPackage || ""}
            onChange={(e) => onFilterChange("membershipPackage", e.target.value)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base bg-white min-w-[100px] sm:min-w-[120px] lg:min-w-[140px]"
          >
            <option value="">Packages</option>
            {membershipPackageOptions.map((pkg) => (
              <option key={pkg} value={pkg}>
                {pkg}
              </option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={filters.role || ""}
            onChange={(e) => onFilterChange("role", e.target.value)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base bg-white min-w-[90px] sm:min-w-[100px] lg:min-w-[120px]"
          >
            <option value="">Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          {/* Sort By Filter */}
          <select
            value={filters.sortBy || "createdAt"}
            onChange={(e) => onFilterChange("sortBy", e.target.value)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base bg-white min-w-[100px] sm:min-w-[120px] lg:min-w-[140px]"
          >
            <option value="createdAt">Date Joined</option>
            <option value="email">Email</option>
            <option value="lastLogin">Last Login</option>
            <option value="totalSpent">Total Spent</option>
            <option value="miniDrawCount">Mini Draws</option>
          </select>

          {/* Items Per Page */}
          <select
            value={filters.limit || 25}
            onChange={(e) => onFilterChange("limit", parseInt(e.target.value))}
            className="px-2 sm:px-3 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base bg-white min-w-[70px] sm:min-w-[80px] lg:min-w-[100px]"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="px-2 sm:px-3 py-1.5 sm:py-2 lg:py-2.5 border-2 border-red-300 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 hover:border-red-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm lg:text-base font-medium transition-colors flex items-center gap-1 sm:gap-1.5 lg:gap-2 whitespace-nowrap"
              title="Clear all filters"
            >
              <X className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Clear Filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}





