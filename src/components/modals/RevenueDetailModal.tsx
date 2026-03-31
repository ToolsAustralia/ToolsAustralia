"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Users,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Download,
  FileSpreadsheet,
  User,
  Calendar,
  Package,
  X,
  Filter,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import Dropdown from "./ui/Dropdown";
import { useRevenueDetails, type RevenueCategory } from "@/hooks/queries/useAdminQueries";
import { format } from "date-fns";
import { formatDisplayName } from "@/utils/display-name";

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
  const [sortBy, setSortBy] = useState<"name" | "amount" | "count" | "date">("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
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

  const handleSort = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      setSortOrder("desc");
    }
  };

  const escapeCSVCell = (val: string) => `"${String(val).replace(/"/g, '""')}"`;

  const handleExportCSV = () => {
    if (!revenueData) return;

    // Create CSV content (UTF-8 BOM for Excel/Windows compatibility)
    const BOM = "\uFEFF";
    const headers = ["Name", "Email", "Mobile", "Purchase Count", "Total Contributed", "First Purchase", "Last Purchase"];
    const rows = filteredAndSortedUsers.map((user) => {
      const purchases = user.purchases.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const firstPurchase = purchases[0]?.timestamp ? format(new Date(purchases[0].timestamp), "yyyy-MM-dd HH:mm") : "";
      const lastPurchase = purchases[purchases.length - 1]?.timestamp
        ? format(new Date(purchases[purchases.length - 1].timestamp), "yyyy-MM-dd HH:mm")
        : "";

      return [
        escapeCSVCell(formatDisplayName(user.userInfo.firstName, user.userInfo.lastName)),
        escapeCSVCell(user.userInfo.email),
        escapeCSVCell(user.userInfo.mobile || ""),
        escapeCSVCell(user.purchaseCount.toString()),
        escapeCSVCell(user.totalContributed.toFixed(2)),
        escapeCSVCell(firstPurchase),
        escapeCSVCell(lastPurchase),
      ];
    });

    const csvContent = BOM + [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${categoryLabels[category!] || "revenue"}-details-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (!revenueData) return;

    // Create Excel-compatible CSV (tab-separated values with UTF-8 BOM for Excel)
    const headers = ["Name", "Email", "Mobile", "Purchase Count", "Total Contributed", "First Purchase", "Last Purchase"];
    const rows = filteredAndSortedUsers.map((user) => {
      const purchases = user.purchases.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const firstPurchase = purchases[0]?.timestamp ? format(new Date(purchases[0].timestamp), "yyyy-MM-dd HH:mm") : "";
      const lastPurchase = purchases[purchases.length - 1]?.timestamp
        ? format(new Date(purchases[purchases.length - 1].timestamp), "yyyy-MM-dd HH:mm")
        : "";

      return [
        formatDisplayName(user.userInfo.firstName, user.userInfo.lastName),
        user.userInfo.email,
        user.userInfo.mobile || "",
        user.purchaseCount.toString(),
        user.totalContributed.toFixed(2),
        firstPurchase,
        lastPurchase,
      ];
    });

    // Excel-compatible format: UTF-8 BOM + tab-separated values + CRLF
    const BOM = "\uFEFF";
    const excelContent = BOM + [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\r\n");
    const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${categoryLabels[category!] || "revenue"}-details-${format(new Date(), "yyyy-MM-dd")}.xls`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

  const formatDate = (dateString: string) => format(new Date(dateString), "MMM d, yyyy HH:mm");

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
                onChange={(e) => setSearchQuery(e.target.value)}
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
                onChange={(value) => setPackageIdFilter(value)}
                placeholder="Package"
                active={!!packageIdFilter}
                compact={true}
              />
            </div>

            {/* Mobile: Filter Icon Button */}
            <div className="sm:hidden relative mobile-filter-container">
              <button
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className={`px-2.5 py-2 border-2 rounded-lg bg-white dark:bg-neutral-900 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md flex-shrink-0 ${
                  hasActiveFilters
                    ? "border-red-500 text-red-600"
                    : "border-gray-300 text-gray-600 dark:text-neutral-400 hover:border-red-500"
                }`}
                aria-label="Toggle filter"
              >
                <Filter className={`w-4 h-4 ${hasActiveFilters ? "text-red-600" : "text-gray-600 dark:text-neutral-400"}`} />
                {hasActiveFilters && <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>}
              </button>

              {/* Mobile Filter Dropdown - Show when icon is clicked */}
              {isFilterDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white dark:bg-neutral-900 border-2 border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg">
                  <div className="p-3 border-b border-gray-200 dark:border-neutral-700 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Filter by Package</span>
                    <button
                      onClick={() => setIsFilterDropdownOpen(false)}
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
                        setPackageIdFilter(value);
                        setIsFilterDropdownOpen(false);
                      }}
                      placeholder="Select Package"
                      active={!!packageIdFilter}
                      compact={false}
                    />
                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          clearAllFilters();
                          setIsFilterDropdownOpen(false);
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
                onClick={clearAllFilters}
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
                onClick={handleExportCSV}
                disabled={!revenueData || filteredAndSortedUsers.length === 0}
                className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline text-xs sm:text-sm">CSV</span>
              </button>
              <button
                onClick={handleExportExcel}
                disabled={!revenueData || filteredAndSortedUsers.length === 0}
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
              {/* Table Header - Desktop */}
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 p-4 bg-gray-50 dark:bg-neutral-800/80 rounded-lg border border-gray-200 dark:border-neutral-700 mb-4 text-sm font-semibold text-gray-700 dark:text-neutral-200">
                <div
                  className="col-span-3 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center gap-1"
                  onClick={() => handleSort("name")}
                >
                  Name
                  {sortBy === "name" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </div>
                <div className="col-span-3">Email</div>
                <div
                  className="col-span-1 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center justify-end gap-1"
                  onClick={() => handleSort("count")}
                >
                  Purchases
                  {sortBy === "count" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </div>
                <div
                  className="col-span-2 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center justify-end gap-1"
                  onClick={() => handleSort("amount")}
                >
                  Total
                  {sortBy === "amount" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </div>
                <div
                  className="col-span-2 cursor-pointer hover:text-gray-900 dark:hover:text-neutral-100 flex items-center gap-1"
                  onClick={() => handleSort("date")}
                >
                  First Purchase
                  {sortBy === "date" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                </div>
                <div className="col-span-1 text-center">Actions</div>
              </div>

              {/* Users List */}
              <div className="space-y-3">
                {paginatedUsers.map((user) => {
                  const isExpanded = expandedUsers.has(user.userId);
                  const sortedPurchases = [...user.purchases].sort(
                    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  );
                  const firstPurchase = sortedPurchases[sortedPurchases.length - 1];

                  return (
                    <div
                      key={user.userId}
                      className="border-2 border-gray-200 dark:border-neutral-600 rounded-lg hover:border-gray-300 dark:hover:border-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800/40 transition-all duration-200"
                    >
                      {/* User Row */}
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => toggleUserExpanded(user.userId)}
                      >
                        {/* Mobile View */}
                        <div className="lg:hidden space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <User className="w-5 h-5 text-gray-400 dark:text-neutral-500" />
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-neutral-100">
                                  {formatDisplayName(user.userInfo.firstName, user.userInfo.lastName)}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-neutral-400">{user.userInfo.email}</p>
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 dark:text-neutral-500" /> : <ChevronDown className="w-5 h-5 text-gray-400 dark:text-neutral-500" />}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-neutral-400">Purchases:</span>{" "}
                              <span className="font-medium text-gray-900 dark:text-neutral-100">{user.purchaseCount}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-gray-500 dark:text-neutral-400">Total:</span>{" "}
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(user.totalContributed)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Desktop View */}
                        <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
                          <div className="col-span-3">
                            <p className="font-semibold text-gray-900 dark:text-neutral-100">
                              {formatDisplayName(user.userInfo.firstName, user.userInfo.lastName)}
                            </p>
                            {user.userInfo.mobile && <p className="text-xs text-gray-500 dark:text-neutral-400">{user.userInfo.mobile}</p>}
                          </div>
                          <div className="col-span-3 text-sm text-gray-600 dark:text-neutral-400">{user.userInfo.email}</div>
                          <div className="col-span-1 text-right font-medium text-gray-900 dark:text-neutral-100">{user.purchaseCount}</div>
                          <div className="col-span-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(user.totalContributed)}
                          </div>
                          <div className="col-span-2 text-sm text-gray-600 dark:text-neutral-400">
                            {firstPurchase ? formatDate(firstPurchase.timestamp) : "N/A"}
                          </div>
                          <div className="col-span-1 text-center">
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 dark:text-neutral-500" /> : <ChevronDown className="w-5 h-5 text-gray-400 dark:text-neutral-500" />}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Purchase Details */}
                      {isExpanded && (
                        <div className="border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/50 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
                              <ShoppingCart className="w-4 h-4" />
                              Purchase Details ({user.purchases.length})
                            </h4>
                            {onUserClick && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUserClick(user.userId);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#ee0000] via-[#ff3333] to-[#ff4444] text-white hover:shadow-lg transition-all duration-200"
                              >
                                <User className="w-4 h-4" />
                                View User
                              </button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {sortedPurchases.map((purchase, idx) => (
                              <div
                                key={purchase.paymentEventId || idx}
                                className="bg-white dark:bg-neutral-900/70 p-3 rounded border border-gray-200 dark:border-neutral-700 flex items-center justify-between"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Package className="w-4 h-4 text-gray-400 dark:text-neutral-500" />
                                    <span className="font-medium text-gray-900 dark:text-neutral-100">
                                      {purchase.packageName || purchase.packageId || "Unknown Package"}
                                    </span>
                                    {purchase.billingReason && (
                                      <span className="text-xs bg-blue-100 dark:bg-blue-950/45 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                                        {purchase.billingReason === "subscription_cycle" ? "Renewal" : "New"}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-neutral-400">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {formatDate(purchase.timestamp)}
                                    </span>
                                    {purchase.packageId && (
                                      <span className="text-gray-500 dark:text-neutral-500">ID: {purchase.packageId}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(purchase.amount)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination - Show when API returns more than 50 users */}
              {revenueData && revenueData.pagination.totalCount > 50 && (
                <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-neutral-800 pt-4">
                  <div className="text-sm text-gray-600 dark:text-neutral-300">
                    {filteredCount > 0 ? (
                      <>
                        Showing {filteredCount} user{filteredCount !== 1 ? "s" : ""} on this page
                        {hasActiveFilters && revenueData.pagination.totalCount > filteredCount && (
                          <span className="text-gray-500 dark:text-neutral-500 ml-1">
                            (filtered from {revenueData.pagination.totalCount.toLocaleString()} total)
                          </span>
                        )}
                        {!hasActiveFilters && (
                          <span className="text-gray-500 dark:text-neutral-500 ml-1">
                            (of {revenueData.pagination.totalCount.toLocaleString()} total)
                          </span>
                        )}
                      </>
                    ) : (
                      "No users found"
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || isLoading}
                      size="sm"
                      variant="outline"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600 dark:text-neutral-300">
                      Page {revenueData.pagination.currentPage} of {revenueData.pagination.totalPages}
                    </span>
                    <Button
                      onClick={() => setPage((p) => Math.min(revenueData.pagination.totalPages, p + 1))}
                      disabled={page >= revenueData.pagination.totalPages || isLoading}
                      size="sm"
                      variant="outline"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              {/* Show pagination info when there are filtered results but no API pagination needed */}
              {revenueData && revenueData.pagination.totalCount <= 50 && filteredCount > 0 && (
                <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-neutral-800 pt-4">
                  <div className="text-sm text-gray-600 dark:text-neutral-300">
                    Showing {filteredCount} user{filteredCount !== 1 ? "s" : ""}
                    {hasActiveFilters && revenueData.pagination.totalCount > filteredCount && (
                      <span className="text-gray-500 dark:text-neutral-500 ml-1">
                        (filtered from {revenueData.pagination.totalCount.toLocaleString()} total)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
