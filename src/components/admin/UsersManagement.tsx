"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Users,
  Mail,
  Key,
  Trophy,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  CreditCard,
  Shield,
  Gift,
  X,
  ClipboardList,
  XCircle,
  Ban,
  RefreshCw,
  PauseCircle,
  Package,
  User,
  Calendar,
  DollarSign,
  Filter,
  ChevronUp,
  ChevronDown,
  Download,
} from "lucide-react";
import Image from "next/image";
import { AdminUserListItem, UserFilters } from "@/types/admin";
import { useAdminUsers, useAdminUserActions } from "@/hooks/queries/useAdminQueries";
import UserDetailModal from "./UserDetailModal";
import UserExportModal from "./UserExportModal";
import ChargePastDueModal from "./ChargePastDueModal";
import KlaviyoSyncButton from "@/features/admin/users/components/KlaviyoSyncButton";
import { useDebounce } from "@/hooks/useDebounce";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { UserMetricsView } from "./metrics/UserMetricsView";
import { membershipPackages } from "@/data/membershipPackages";
import { getPackageIconByName } from "@/utils/images/package-icons";
import defaultLogo from "../../../public/images/Tools Australia Logo/Social Media Profile_Black Background.png";
import Dropdown from "@/components/modals/ui/Dropdown";

/**
 * World-class Users Management component
 * Provides comprehensive user management interface with stats, filtering, and modern design
 */
export default function UsersManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Filter state
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 25,
    search: "",
    subscriptionStatus: undefined,
    autoRenew: undefined,
    membershipPackage: undefined,
    role: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false); // Mobile filter collapse state
  
  // View mode with URL persistence
  const urlViewMode = searchParams.get("viewMode") as "users" | "metrics" | null;
  const [viewMode, setViewMode] = useState<"users" | "metrics">(urlViewMode || "users");

  // Sync viewMode with URL params (only when URL changes, not on every render)
  useEffect(() => {
    const currentUrlViewMode = searchParams.get("viewMode") as "users" | "metrics" | null;
    const newViewMode = currentUrlViewMode || "users";
    setViewMode((prev) => {
      // Only update if different to avoid unnecessary re-renders
      if (prev !== newViewMode) {
        return newViewMode;
      }
      return prev;
    });
  }, [searchParams]); // Only depend on searchParams to sync from URL to state

  // Update URL when viewMode changes
  const handleViewModeChange = (mode: "users" | "metrics") => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("viewMode", mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Debounced search to avoid excessive API calls
  const debouncedSearch = useDebounce(filters.search || "", 300);

  // Update filters with debounced search
  const queryFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [filters, debouncedSearch]
  );

  // Fetch users data
  const { data: usersData, isLoading, error, refetch } = useAdminUsers(queryFilters);

  const userActions = useAdminUserActions();

  // Get stats from API response
  const stats = useMemo(() => {
    const defaultStats = {
      totalUsers: 0,
      activeSubscriptions: 0,
      verifiedUsers: 0,
      conversions: 0,
      conversionRate: 0,
    };

    if (!usersData?.stats) {
      return defaultStats;
    }

    const totalUsers = usersData.stats.totalUsers || 0;
    const conversions = (usersData.stats as { conversions?: number }).conversions || 0;
    const conversionRate = totalUsers > 0 ? Math.round((conversions / totalUsers) * 100 * 10) / 10 : 0; // Round to 1 decimal place

    return {
      totalUsers,
      activeSubscriptions: usersData.stats.activeSubscriptions || 0,
      verifiedUsers: usersData.stats.verifiedUsers || 0,
      conversions,
      conversionRate,
    };
  }, [usersData]);

  // Get unique membership packages for filter dropdown
  const membershipPackageOptions = useMemo(() => {
    const packages = membershipPackages
      .filter((pkg) => pkg.isActive && pkg.type === "subscription")
      .map((pkg) => pkg.name)
      .sort();
    return packages;
  }, []);

  // Handle filter changes
  const updateFilter = (key: keyof UserFilters, value: string | number) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filters change
    }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      page: 1,
      limit: 25,
      search: "",
      subscriptionStatus: undefined,
      autoRenew: undefined,
      membershipPackage: undefined,
      role: undefined,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.search ||
      filters.subscriptionStatus ||
      filters.autoRenew ||
      filters.membershipPackage ||
      filters.role ||
      filters.sortBy !== "createdAt" ||
      filters.sortOrder !== "desc"
    );
  }, [filters]);

  // Handle pagination
  const goToPage = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  // Handle sorting
  const handleSort = (sortBy: UserFilters["sortBy"]) => {
    setFilters((prev) => {
      // First click on any column should be descending
      if (prev.sortBy !== sortBy) {
        return {
          ...prev,
          sortBy,
          sortOrder: "desc",
        };
      }
      // Subsequent clicks toggle between asc and desc
      return {
        ...prev,
        sortBy,
        sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
      };
    });
  };

  // Get sort icon
  const getSortIcon = (column: UserFilters["sortBy"]) => {
    if (filters.sortBy !== column) {
      return null;
    }
    return filters.sortOrder === "asc" ? (
      <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
    ) : (
      <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
    );
  };

  // Handle user row click
  const handleUserClick = (user: AdminUserListItem) => {
    setSelectedUserId(user.id);
    setIsDetailModalOpen(true);
  };

  // Handle quick actions
  const handleQuickAction = async (action: string, userId: string) => {
    try {
      await userActions.mutateAsync({
        userId,
        actionData: {
          action: action as
            | "resend_verification"
            | "reset_password"
            | "toggle_status"
            | "add_note"
            | "resend_sms_verification",
        },
      });
      refetch(); // Refresh the user list
    } catch (error) {
      console.error("Quick action failed:", error);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get package icon image (uses centralized utility for consistency)
  const getPackageIconImage = (packageName?: string | null) => {
    if (!packageName) return null;
    // Try subscription first, then one-time as fallback
    return getPackageIconByName(packageName, "subscription") || getPackageIconByName(packageName, "one-time");
  };

  // Get package color scheme (matching PartnerDiscountQueue logic)
  const getPackageColorScheme = (packageName?: string | null) => {
    if (!packageName) return null;
    const lowerName = packageName.toLowerCase();

    if (lowerName.includes("apprentice")) {
      return {
        gradient: "from-gray-300 via-slate-400 to-gray-500",
        text: "text-gray-300",
        border: "border-gray-400/40",
      };
    } else if (lowerName.includes("tradie")) {
      return {
        gradient: "from-blue-500 via-blue-600 to-blue-700",
        text: "text-blue-400",
        border: "border-blue-500/50",
      };
    } else if (lowerName.includes("foreman")) {
      return {
        gradient: "from-green-500 via-green-600 to-green-700",
        text: "text-green-300",
        border: "border-green-500/50",
      };
    } else if (lowerName.includes("boss")) {
      return {
        gradient: "from-yellow-400 via-amber-500 to-yellow-600",
        text: "text-yellow-400",
        border: "border-yellow-400/50",
      };
    } else if (lowerName.includes("power")) {
      return {
        gradient: "from-orange-600 via-red-500 to-orange-700",
        text: "text-orange-400",
        border: "border-orange-500/50",
      };
    }

    // Default fallback
    return {
      gradient: "from-slate-600 via-gray-700 to-slate-800",
      text: "text-gray-400",
      border: "border-gray-500/50",
    };
  };

  // Helper function to extract gradient color for border (matching PartnerDiscountQueue)
  const getGradientColor = (gradient: string): string => {
    if (gradient.includes("yellow-3") || gradient.includes("yellow-4")) return "#facc15";
    if (gradient.includes("blue")) return "#3b82f6";
    if (gradient.includes("purple")) return "#9333ea";
    if (gradient.includes("orange")) return "#f97316";
    if (gradient.includes("yellow-4") && gradient.includes("amber")) return "#fbbf24";
    if (gradient.includes("gray-300") || gradient.includes("slate-400")) return "#94a3b8"; // Silver
    if (gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6"; // Blue
    if (gradient.includes("green-500") || gradient.includes("green-600")) return "#22c55e"; // Green
    return "#6b7280";
  };

  // Get subscription status badge
  const getSubscriptionBadge = (user: AdminUserListItem) => {
    if (!user.subscription) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
          No Subscription
        </span>
      );
    }

    // Check if status is incomplete or cancelled - show "No Subscription"
    const status = user.subscription.status?.toLowerCase();
    if (status === "incomplete" || status === "cancelled" || status === "canceled") {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
          No Subscription
        </span>
      );
    }

    if (user.subscription.isActive) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
          Active
        </span>
      );
    }

    // Check for past_due status
    if (status === "past_due") {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
          Past Due
        </span>
      );
    }

    return (
      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        Inactive
      </span>
    );
  };

  // Get user status badge
  const getUserStatusBadge = (user: AdminUserListItem) => {
    if (user.isActive) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
          Active
        </span>
      );
    }

    return (
      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        Inactive
      </span>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Simplified */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
          User Management
        </h2>
        {/* Actions - Export button and View Mode Toggle */}
        <div className="flex items-center gap-2">
          {/* Klaviyo Sync Button */}
          <KlaviyoSyncButton />
          {/* Charge Past Due Button */}
          <button
            onClick={() => setIsChargeModalOpen(true)}
            disabled={isLoading}
            className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 text-white text-xs sm:text-sm font-medium hover:from-yellow-700 hover:to-yellow-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
            title="Charge past due customers"
          >
            <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Charge Past Due</span>
          </button>
          {/* Export Button */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            disabled={isLoading || !usersData || usersData.users.length === 0}
            className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white text-xs sm:text-sm font-medium hover:from-red-700 hover:to-red-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
            title="Export users"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {/* View Mode Toggle - Hidden on mobile, shown on desktop */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleViewModeChange("users")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "users"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Users
            </button>
            <button
              onClick={() => handleViewModeChange("metrics")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "metrics"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Metrics
            </button>
          </div>
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === "metrics" ? (
        <UserMetricsView />
      ) : (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard title="Total Users" value={stats.totalUsers} icon={Users} color="blue" loading={isLoading} />
        <MetricCard
          title="Active Subscriptions"
          value={stats.activeSubscriptions}
          icon={CreditCard}
          color="emerald"
          loading={isLoading}
        />
        <MetricCard
          title="Conversions"
          value={`${stats.conversionRate}%`}
          icon={CheckCircle}
          color="green"
          subtitle="Users who made a purchase"
          loading={isLoading}
        />
        <MetricCard
          title="Verified Users"
          value={stats.verifiedUsers}
          icon={Shield}
          color="purple"
          loading={isLoading}
        />
      </div>

      {/* Search and Filters - Elevated Design */}
      <div className="bg-gradient-to-br from-white via-gray-50 to-white rounded-xl shadow-lg border-2 border-gray-200/50 p-2 sm:p-4 lg:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 lg:gap-4">
          {/* Search Bar - Enhanced */}
          <div className="relative flex-1 group flex items-center gap-2">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-red-600 transition-colors w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search users..."
              value={filters.search || ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="w-full pl-8 sm:pl-10 lg:pl-12 pr-3 sm:pr-4 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white text-xs sm:text-sm lg:text-base shadow-sm hover:shadow-md transition-all duration-200 placeholder:text-gray-400"
            />
            {/* Mobile Filter Toggle Button */}
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="sm:hidden px-2.5 py-1.5 border-2 border-gray-300 rounded-lg bg-white hover:border-red-500 hover:bg-red-50 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
              aria-label="Toggle filters"
            >
              <Filter className={`w-4 h-4 ${hasActiveFilters ? "text-red-600" : "text-gray-600"}`} />
              {hasActiveFilters && <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>}
              {isFiltersOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>

          {/* Filters - Elevated Design with Dropdown Components */}
          {/* Hidden on mobile by default, shown when isFiltersOpen is true */}
          <div
            className={`flex flex-wrap gap-1.5 sm:gap-2 lg:gap-2.5 transition-all duration-300 ${
              isFiltersOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"
            } sm:max-h-none sm:opacity-100 sm:overflow-visible`}
          >
            {/* Subscription Status Filter */}
            <div className="min-w-[100px] sm:min-w-[130px] lg:min-w-[150px]">
              <Dropdown
                options={[
                  { value: "", label: "Subscriptions", icon: ClipboardList },
                  { value: "active", label: "Active", icon: CheckCircle },
                  { value: "past_due", label: "Past Due", icon: AlertTriangle },
                  { value: "none", label: "No Subscription", icon: Ban },
                ]}
                value={filters.subscriptionStatus || ""}
                onChange={(value) => updateFilter("subscriptionStatus", value)}
                placeholder="Subscriptions"
                active={!!filters.subscriptionStatus}
              />
            </div>

            {/* AutoRenew Filter */}
            <div className="min-w-[100px] sm:min-w-[130px] lg:min-w-[150px]">
              <Dropdown
                options={[
                  { value: "", label: "Auto-Renew", icon: RefreshCw },
                  { value: "true", label: "Will Renew", icon: CheckCircle },
                  { value: "false", label: "Cancelled", icon: PauseCircle },
                ]}
                value={filters.autoRenew || ""}
                onChange={(value) => updateFilter("autoRenew", value)}
                placeholder="Auto-Renew"
                active={!!filters.autoRenew}
              />
            </div>

            {/* Membership Package Filter */}
            <div className="min-w-[100px] sm:min-w-[130px] lg:min-w-[150px]">
              <Dropdown
                options={[
                  { value: "", label: "Packages", icon: Package },
                  ...membershipPackageOptions.map((pkg) => ({ value: pkg, label: pkg })),
                ]}
                value={filters.membershipPackage || ""}
                onChange={(value) => updateFilter("membershipPackage", value)}
                placeholder="Packages"
                active={!!filters.membershipPackage}
              />
            </div>

            {/* Role Filter */}
            <div className="min-w-[90px] sm:min-w-[110px] lg:min-w-[130px]">
              <Dropdown
                options={[
                  { value: "", label: "Roles", icon: User },
                  { value: "user", label: "User", icon: User },
                  { value: "admin", label: "Admin", icon: Shield },
                ]}
                value={filters.role || ""}
                onChange={(value) => updateFilter("role", value)}
                placeholder="Roles"
                active={!!filters.role}
              />
            </div>

            {/* Sort By Filter */}
            <div className="min-w-[100px] sm:min-w-[130px] lg:min-w-[150px]">
              <Dropdown
                options={[
                  { value: "createdAt", label: "Date Joined", icon: Calendar },
                  { value: "email", label: "Email", icon: Mail },
                  { value: "lastLogin", label: "Last Login", icon: Clock },
                  { value: "totalSpent", label: "Total Spent", icon: DollarSign },
                  { value: "miniDrawCount", label: "Mini Draws", icon: Gift },
                ]}
                value={filters.sortBy || "createdAt"}
                onChange={(value) => updateFilter("sortBy", value)}
                placeholder="Sort By"
                active={filters.sortBy !== "createdAt"}
              />
            </div>

            {/* Items Per Page */}
            <div className="min-w-[70px] sm:min-w-[80px] lg:min-w-[90px]">
              <Dropdown
                options={[
                  { value: "10", label: "10" },
                  { value: "25", label: "25" },
                  { value: "50", label: "50" },
                  { value: "100", label: "100" },
                ]}
                value={String(filters.limit || 25)}
                onChange={(value) => updateFilter("limit", parseInt(value))}
                placeholder="Limit"
                active={filters.limit !== 25}
              />
            </div>

            {/* Clear Filters Button - Enhanced */}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="px-2 sm:px-3 py-1.5 sm:py-2 border-2 border-red-500/30 bg-gradient-to-r from-red-50 to-red-100/50 text-red-700 rounded-lg hover:from-red-100 hover:to-red-200 hover:border-red-500/50 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                title="Clear all filters"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Summary */}
      {usersData && (
        <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600">
          <p>
            Showing {(usersData.pagination.currentPage - 1) * usersData.pagination.limit + 1} to{" "}
            {Math.min(usersData.pagination.currentPage * usersData.pagination.limit, usersData.pagination.totalCount)}{" "}
            of {usersData.pagination.totalCount} users
          </p>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {isLoading ? (
          // Enhanced Loading skeleton
          <div className="p-4 sm:p-6">
            <div className="space-y-3 sm:space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3 sm:space-x-4 animate-pulse">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-4 bg-gray-200 rounded w-1/3 sm:w-1/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 sm:w-1/3"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-16 sm:w-20 hidden sm:block"></div>
                  <div className="h-6 bg-gray-200 rounded w-20 sm:w-24 hidden md:block"></div>
                  <div className="h-6 bg-gray-200 rounded w-16 sm:w-20"></div>
                  <div className="h-8 bg-gray-200 rounded w-20 sm:w-24"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          // Enhanced Error state
          <div className="p-6 sm:p-8 text-center">
            <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Error Loading Users</h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4">
              {error instanceof Error ? error.message : "Failed to load users"}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all font-medium"
            >
              Try Again
            </button>
          </div>
        ) : !usersData?.users.length ? (
          // Enhanced Empty state
          <div className="p-6 sm:p-8 text-center">
            <Users className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Users Found</h3>
            <p className="text-sm sm:text-base text-gray-600">
              {filters.search || filters.subscriptionStatus || filters.role
                ? "Try adjusting your search criteria"
                : "No users have been registered yet"}
            </p>
          </div>
        ) : (
          // Enhanced Users table
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th
                      className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("createdAt")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        User
                        {getSortIcon("createdAt")}
                      </div>
                    </th>
                    <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider">
                      Subscription
                    </th>
                    <th
                      className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("totalSpent")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Total Spent
                        {getSortIcon("totalSpent")}
                      </div>
                    </th>
                    <th
                      className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors hidden md:table-cell"
                      onClick={() => handleSort("majorDrawEntries")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Major Draw Entries
                        {getSortIcon("majorDrawEntries")}
                      </div>
                    </th>
                    <th
                      className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("miniDrawCount")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Mini Draws
                        {getSortIcon("miniDrawCount")}
                      </div>
                    </th>
                    <th
                      className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("lastLogin")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Last Login
                        {getSortIcon("lastLogin")}
                      </div>
                    </th>
                    <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell">
                      Status
                    </th>
                    <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {usersData.users.map((user) => {
                    const packageIcon = getPackageIconImage(user.subscription?.packageName);
                    const colorScheme = getPackageColorScheme(user.subscription?.packageName);
                    const hasActiveSubscription = user.subscription?.isActive;
                    const borderGradientColor = colorScheme ? getGradientColor(colorScheme.gradient) : "#6b7280";
                    const isPremiumPackage =
                      user.subscription?.packageName?.toLowerCase().includes("boss") ||
                      user.subscription?.packageName?.toLowerCase().includes("power");

                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors even:bg-gray-50/30"
                        onClick={() => handleUserClick(user)}
                      >
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {/* User Avatar - Logo or Package Icon */}
                            {hasActiveSubscription && packageIcon ? (
                              <span
                                className={`inline-flex items-center justify-center rounded-full shadow-lg relative overflow-hidden flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 ${
                                  isPremiumPackage ? "animate-pulse" : ""
                                }`}
                                style={{
                                  border: `2px solid transparent`,
                                  backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${borderGradientColor}, transparent)`,
                                  backgroundOrigin: `border-box`,
                                  backgroundClip: `padding-box, border-box`,
                                  padding: "2px",
                                }}
                              >
                                <div className="relative w-full h-full flex-shrink-0 flex items-center justify-center">
                                  <Image
                                    src={packageIcon}
                                    alt={user.subscription?.packageName || "Package"}
                                    className="w-5 h-5 sm:w-7 sm:h-7 lg:w-9 lg:h-9 object-contain"
                                    width={36}
                                    height={36}
                                  />
                                </div>
                              </span>
                            ) : (
                              <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
                                <Image
                                  src={defaultLogo}
                                  alt="Tools Australia"
                                  className="w-full h-full object-cover"
                                  width={48}
                                  height={48}
                                />
                              </div>
                            )}
                            <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0 flex-1">
                              <div className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900 truncate">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-[9px] sm:text-xs lg:text-sm text-gray-500 truncate">
                                {user.email}
                              </div>
                              <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 mt-0.5 sm:mt-1">
                                {user.isEmailVerified ? (
                                  <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-yellow-500 flex-shrink-0" />
                                )}
                                {user.role === "admin" && (
                                  <span className="text-[9px] sm:text-[10px] lg:text-xs text-gray-500 font-medium">
                                    Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
                          {getSubscriptionBadge(user)}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-[10px] sm:text-xs lg:text-sm font-medium text-gray-900">
                          {formatCurrency(user.totalSpent)}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap hidden md:table-cell">
                          <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 text-yellow-500 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900">
                              {user.majorDrawEntries}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
                          <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                            <Gift className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 text-purple-500 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900">
                              {user.miniDrawCount || 0}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-[10px] sm:text-xs lg:text-sm text-gray-500">
                          {user.lastLogin ? (
                            <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 flex-shrink-0" />
                              <span className="truncate">{formatDate(user.lastLogin)}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">Never</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap hidden sm:table-cell">
                          {getUserStatusBadge(user)}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-[10px] sm:text-xs lg:text-sm font-medium">
                          <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUserClick(user);
                              }}
                              className="text-red-600 hover:text-red-700 transition-colors p-1 sm:p-1.5 hover:bg-red-50 rounded"
                              title="View Details"
                            >
                              <Eye className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickAction("resend_verification", user.id);
                              }}
                              className="text-blue-600 hover:text-blue-700 transition-colors p-1 sm:p-1.5 hover:bg-blue-50 rounded"
                              title="Resend Verification"
                            >
                              <Mail className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickAction("reset_password", user.id);
                              }}
                              className="text-yellow-600 hover:text-yellow-700 transition-colors p-1 sm:p-1.5 hover:bg-yellow-50 rounded"
                              title="Reset Password"
                            >
                              <Key className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Enhanced Pagination */}
            {usersData.pagination.totalPages > 1 && (
              <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 border-t-2 border-gray-200">
                <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => goToPage(1)}
                      disabled={!usersData.pagination.hasPrevPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="First page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => goToPage(usersData.pagination.currentPage - 1)}
                      disabled={!usersData.pagination.hasPrevPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-700 font-medium">
                      Page {usersData.pagination.currentPage} of {usersData.pagination.totalPages}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => goToPage(usersData.pagination.currentPage + 1)}
                      disabled={!usersData.pagination.hasNextPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => goToPage(usersData.pagination.totalPages)}
                      disabled={!usersData.pagination.hasNextPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Last page"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

      {/* User Detail Modal */}
      <UserDetailModal
        userId={selectedUserId}
        isOpen={isDetailModalOpen}
        onCloseAction={() => {
          setIsDetailModalOpen(false);
          setSelectedUserId(null);
        }}
      />

      {/* User Export Modal */}
      {/* Charge Past Due Modal */}
      <ChargePastDueModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onConfirm={async () => {
          const response = await fetch("/api/admin/invoices/charge-past-due", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ confirmation: "CHARGE" }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to charge invoices");
          }

          // Refresh user list
          refetch();

          return data;
        }}
      />

      <UserExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filters={filters}
        totalUsers={usersData?.pagination.totalCount}
      />

      {/* Floating View Toggle Buttons - Mobile Only */}
      <div className="fixed bottom-6 right-6 z-50 sm:hidden">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleViewModeChange("users")}
            className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-sm font-semibold transition-all ${
              viewMode === "users"
                ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-red-500/50"
                : "bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200"
            }`}
            aria-label="Users View"
          >
            Users
          </button>
          <button
            onClick={() => handleViewModeChange("metrics")}
            className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-sm font-semibold transition-all ${
              viewMode === "metrics"
                ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-red-500/50"
                : "bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200"
            }`}
            aria-label="Metrics View"
          >
            Metrics
          </button>
        </div>
      </div>
    </div>
  );
}
