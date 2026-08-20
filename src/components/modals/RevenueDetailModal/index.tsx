"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Users } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useRevenueDetails, type RevenueCategory } from "@/hooks/queries/useAdminQueries";
import FilterToolbar from "./FilterToolbar";
import UserList from "./UserList";
import Pagination from "./Pagination";
import { exportRevenueDetailsCSV, exportRevenueDetailsExcel } from "./utils/exporters";
import type { SortKey, SortOrder } from "./TableHeader";

interface RevenueDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: RevenueCategory | null;
  dateRange: "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw";
  startDate?: string;
  endDate?: string;
  onUserClick?: (userId: string) => void;
}

const categoryLabels: Record<RevenueCategory, string> = {
  "membership-purchase": "Membership New",
  "membership-renewal": "Membership Renewal",
  "one-time-purchase": "One-Time First",
  "additional-one-time": "One-Time Additional",
  "mini-draw": "Mini Draws",
  upsell: "Upsells",
  shop: "Merchandise",
};

export default function RevenueDetailModal({
  isOpen,
  onClose,
  category,
  dateRange,
  startDate,
  endDate,
  onUserClick,
}: RevenueDetailModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [packageIdFilter, setPackageIdFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("amount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const {
    data: revenueData,
    isLoading,
    error,
  } = useRevenueDetails(category, dateRange, startDate, endDate, page, 50);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setPackageIdFilter("");
      setPage(1);
      setExpandedUsers(new Set());
      setIsFilterDropdownOpen(false);
    }
  }, [isOpen]);

  // Close mobile filter dropdown when clicking outside
  useEffect(() => {
    if (!isFilterDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.mobile-filter-container')) {
        setIsFilterDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterDropdownOpen]);

  // Get unique package IDs from revenue data
  const packageIdOptions = useMemo(() => {
    if (!revenueData?.users) return [];

    const packageIds = new Set<string>();
    revenueData.users.forEach((user) => {
      user.purchases.forEach((purchase) => {
        if (purchase.packageId) {
          packageIds.add(purchase.packageId);
        }
      });
    });

    // Convert to sorted array of dropdown options
    return Array.from(packageIds)
      .sort()
      .map((packageId) => ({
        value: packageId,
        label: packageId,
      }));
  }, [revenueData?.users]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, packageIdFilter]);

  // Filter and sort users
  const filteredAndSortedUsers = useMemo(() => {
    if (!revenueData?.users) return [];

    let filtered = revenueData.users;

    // Apply search filter (similar to admin user page logic)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.trim().toLowerCase();
      // Support searching by: email, firstName, lastName, full name, mobile, or userId
      filtered = filtered.filter((user) => {
        const fullName = `${user.userInfo.firstName} ${user.userInfo.lastName}`.toLowerCase();
        const email = user.userInfo.email.toLowerCase();
        const mobile = user.userInfo.mobile?.toLowerCase() || "";
        const firstName = user.userInfo.firstName.toLowerCase();
        const lastName = user.userInfo.lastName.toLowerCase();
        const userId = user.userId.toLowerCase();

        return (
          email.includes(query) ||
          firstName.includes(query) ||
          lastName.includes(query) ||
          fullName.includes(query) ||
          mobile.includes(query) ||
          userId.includes(query)
        );
      });
    }

    // Apply package ID filter
    if (packageIdFilter) {
      filtered = filtered.filter((user) => {
        return user.purchases.some((purchase) => purchase.packageId === packageIdFilter);
      });
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case "name":
          aValue = `${a.userInfo.firstName} ${a.userInfo.lastName}`.toLowerCase();
          bValue = `${b.userInfo.firstName} ${b.userInfo.lastName}`.toLowerCase();
          break;
        case "amount":
          aValue = a.totalContributed;
          bValue = b.totalContributed;
          break;
        case "count":
          aValue = a.purchaseCount;
          bValue = b.purchaseCount;
          break;
        case "date":
          aValue = a.purchases.length > 0 ? new Date(a.purchases[0].timestamp).getTime() : 0;
          bValue = b.purchases.length > 0 ? new Date(b.purchases[0].timestamp).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return filtered;
  }, [revenueData?.users, debouncedSearchQuery, packageIdFilter, sortBy, sortOrder]);

  // Calculate filtered count (for display purposes)
  const filteredCount = filteredAndSortedUsers.length;

  // Use all filtered users (no client-side pagination since API handles pagination)
  const paginatedUsers = filteredAndSortedUsers;

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(searchQuery.trim() || packageIdFilter);
  }, [searchQuery, packageIdFilter]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setPackageIdFilter("");
    setPage(1);
  };

  const toggleUserExpanded = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const handleSort = (newSortBy: SortKey) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      setSortOrder("desc");
    }
  };

  const handleExportCSV = () => {
    if (!revenueData) return;
    const label = category ? categoryLabels[category] : "revenue";
    exportRevenueDetailsCSV(filteredAndSortedUsers, label);
  };

  const handleExportExcel = () => {
    if (!revenueData) return;
    const label = category ? categoryLabels[category] : "revenue";
    exportRevenueDetailsExcel(filteredAndSortedUsers, label);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1200px]">
      <ModalHeader
        title={category ? categoryLabels[category] : "Revenue Details"}
        subtitle={
          revenueData
            ? `${formatCurrency(revenueData.totalRevenue)} • ${revenueData.totalPurchases.toLocaleString()} purchases • ${revenueData.totalUsers.toLocaleString()} users`
            : "Loading..."
        }
        onClose={onClose}
      />

      {/* Search and Actions */}
      <FilterToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        packageIdFilter={packageIdFilter}
        onPackageIdFilterChange={setPackageIdFilter}
        packageIdOptions={packageIdOptions}
        isFilterDropdownOpen={isFilterDropdownOpen}
        onFilterDropdownOpenChange={setIsFilterDropdownOpen}
        hasActiveFilters={hasActiveFilters}
        onClearAllFilters={clearAllFilters}
        onExportCSV={handleExportCSV}
        onExportExcel={handleExportExcel}
        isLoading={isLoading}
        hasData={!!revenueData}
        hasFilteredUsers={filteredAndSortedUsers.length > 0}
      />

      {/* Content */}
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 m-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/45 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300 text-sm">{error instanceof Error ? error.message : "Failed to load revenue details"}</span>
            </div>
          )}

          {isLoading && !revenueData && (
            <div className="p-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-gray-400 animate-spin" />
              <p className="text-gray-600 dark:text-neutral-400">Loading revenue details...</p>
            </div>
          )}

          {!isLoading && revenueData && filteredAndSortedUsers.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-neutral-600" />
              <p className="text-lg font-medium text-gray-900 dark:text-neutral-100">No users found</p>
              <p className="text-sm mt-1">
                {searchQuery.trim() ? "Try a different search term" : "No purchases found for this category"}
              </p>
            </div>
          )}

          {revenueData && filteredAndSortedUsers.length > 0 && (
            <div className="p-4">
              <UserList
                users={paginatedUsers}
                expandedUsers={expandedUsers}
                onToggleExpanded={toggleUserExpanded}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                onUserClick={onUserClick}
              />

              {/* Pagination - Show when API returns more than 50 users */}
              {revenueData && (
                <Pagination
                  isServerPaginationActive={revenueData.pagination.totalCount > 50}
                  filteredCount={filteredCount}
                  totalCount={revenueData.pagination.totalCount}
                  hasActiveFilters={hasActiveFilters}
                  currentPage={revenueData.pagination.currentPage}
                  totalPages={revenueData.pagination.totalPages}
                  page={page}
                  onPageChange={setPage}
                  isLoading={isLoading}
                />
              )}
            </div>
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
