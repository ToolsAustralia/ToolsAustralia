"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Users,
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
  Ban,
  RefreshCw,
  PauseCircle,
  Package,
  User,
  Filter,
  ChevronUp,
  ChevronDown,
  Download,
  MapPin,
  BarChart3,
  Flame,
  Crown,
} from "lucide-react";
import Image from "next/image";
import { AdminUserListItem, UserFilters } from "@/types/admin";
import { useAdminUsers } from "@/hooks/queries/useAdminQueries";
import UserExportModal from "./UserExportModal";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import ChargePastDueModal from "./ChargePastDueModal";
import KlaviyoSyncButton from "@/features/admin/users/components/KlaviyoSyncButton";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { UserMetricsView } from "./metrics/UserMetricsView";
import { membershipPackages } from "@/data/membershipPackages";
import { getPackageIconByName, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { derivePlanIdFromPackage } from "@/utils/package-colors/packageColorScheme";
import { getPackageColorScheme, getGradientColor } from "@/features/admin/users/utils/userHelpers";
import { formatDisplayName } from "@/utils/display-name";
import defaultLogo from "../../../public/images/Tools Australia Logo/Social Media Profile_Black Background.webp";
import Dropdown from "@/components/modals/ui/Dropdown";
import Checkbox from "@/components/modals/ui/Checkbox";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { renderAdminSubscriptionBadge } from "@/components/admin/ui/AdminBadge";
import { cn } from "@/utils/cn";

function AdminStatesMultiSelect({
  selected,
  onChange,
}: {
  selected: string[] | undefined;
  onChange: (codes: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const codes = selected ?? [];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleCode = (code: string) => {
    const set = new Set(codes);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    const next = Array.from(set).sort();
    onChange(next.length ? next : undefined);
  };

  const active = codes.length > 0;
  const summary =
    codes.length === 0 ? "State" : codes.length === 1 ? codes[0]! : `${codes.length} states`;

  return (
    <div
      className={cn("relative w-full min-w-[220px]", open ? "z-[100]" : "")}
      ref={ref}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={active ? codes.join(", ") : "Filter by state / territory"}
        className={`
          w-full min-w-[220px] border rounded-xl text-left transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
          px-3 py-2 sm:px-4 sm:text-sm text-sm
          ${
            active
              ? "border-red-500 dark:border-red-500 bg-red-50/80 dark:bg-red-950/40 shadow-md"
              : "border-gray-300 dark:border-neutral-600 bg-[#ffffff] dark:!bg-neutral-900 hover:border-gray-400 dark:hover:border-neutral-500"
          }
          ${open ? "ring-2 ring-red-500 border-transparent dark:border-transparent" : ""}
        `}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`flex min-w-0 flex-1 items-center gap-2 ${
              active ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-neutral-400"
            }`}
          >
            <MapPin className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-neutral-400" />
            <span className="truncate whitespace-nowrap">{summary}</span>
          </span>
          <ChevronDown
            className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-neutral-500 transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </div>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-[100] mt-1 w-full min-w-[220px] max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-[#ffffff] shadow-lg dark:border-neutral-600 dark:!bg-neutral-950 dark:shadow-2xl dark:shadow-black/50"
          role="listbox"
          onWheel={(e) => e.stopPropagation()}
        >
          {codes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              Clear states
            </button>
          )}
          {AUSTRALIAN_STATES.map((s) => {
            const checked = codes.includes(s.code);
            const id = `admin-users-filter-state-${s.code}`;
            return (
              <div
                key={s.code}
                className="transition-colors hover:bg-red-50 dark:hover:bg-neutral-800"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onChange={() => toggleCode(s.code)}
                  label={`${s.code} · ${s.name}`}
                  className="!m-0 w-full !items-center px-4 py-3 !gap-3 !text-sm text-gray-900 dark:text-neutral-100 [&_label]:cursor-pointer [&_label]:whitespace-nowrap [&_label]:font-normal"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * World-class Users Management component
 * Provides comprehensive user management interface with stats, filtering, and modern design
 */
export default function UsersManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { has } = usePermissions();

  // Filter state
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 25,
    search: "",
    subscriptionStatus: undefined,
    autoRenew: undefined,
    membershipPackage: undefined,
    role: undefined,
    states: undefined,
    inActiveMajorDraw: undefined,
    miniDrawPackage: undefined,
    inActiveMiniDraw: undefined,
    streak: undefined,
    segment: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const { openUserModal } = useAdminUserModal();
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
      states: undefined,
      inActiveMajorDraw: undefined,
      miniDrawPackage: undefined,
      inActiveMiniDraw: undefined,
      streak: undefined,
      segment: undefined,
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
      (filters.states?.length ?? 0) > 0 ||
      filters.inActiveMajorDraw ||
      filters.miniDrawPackage ||
      filters.inActiveMiniDraw ||
      filters.streak ||
      filters.segment
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
      <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 shrink-0" />
    );
  };

  /**
   * Opening a row is gated on `users.viewDetail`, not `users.view`.
   *
   * `view` grants this roster; `viewDetail` grants the modal behind it (email, mobile, address,
   * payment history). A role can hold the first without the second. This is presentation only —
   * `GET /api/admin/users/[id]` and the modal's sub-reads enforce the same permission server-side,
   * so a crafted request gets a 403 regardless of what this component renders.
   */
  const canViewDetail = has("users.viewDetail");

  const handleUserClick = (user: AdminUserListItem) => {
    if (!canViewDetail) return;
    openUserModal(user.id);
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Simplified */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 truncate">
          User Management
        </h2>
        {/* Actions - Export button and View Mode Toggle */}
        <div className="flex items-center gap-2">
          {/* Mobile-only: switch between users / metrics view (replaces sync button on small screens) */}
          <button
            onClick={() => handleViewModeChange(viewMode === "metrics" ? "users" : "metrics")}
            className="sm:hidden px-3 py-1.5 rounded-lg bg-gradient-to-r from-slate-800 to-slate-900 text-white text-xs font-medium hover:from-slate-900 hover:to-black transition-all duration-200 flex items-center gap-1.5 shadow-sm"
            aria-label={viewMode === "metrics" ? "Switch to users list" : "Switch to metrics"}
            title={viewMode === "metrics" ? "Switch to users list" : "Switch to metrics"}
          >
            {viewMode === "metrics" ? (
              <>
                <Users className="w-3.5 h-3.5" />
                Users
              </>
            ) : (
              <>
                <BarChart3 className="w-3.5 h-3.5" />
                Metrics
              </>
            )}
          </button>
          {/* Klaviyo Sync Button — desktop only, needs overview.edit (matches the
              /api/admin/klaviyo/draw-reset-execute permission). */}
          {has("overview.edit") && (
            <div className="hidden sm:block">
              <KlaviyoSyncButton />
            </div>
          )}
          {/* Charge Past Due Button — needs users.charge */}
          {has("users.charge") && (
            <button
              onClick={() => setIsChargeModalOpen(true)}
              disabled={isLoading}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 text-white text-xs sm:text-sm font-medium hover:from-yellow-700 hover:to-yellow-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
              title="Charge past due customers"
            >
              <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Charge Past Due</span>
            </button>
          )}
          {/* Export Button — needs users.export (separate from users.view to
              keep data leakage gated independently of in-app viewing). */}
          {has("users.export") && (
            <button
              onClick={() => setIsExportModalOpen(true)}
              disabled={isLoading || !usersData || usersData.users.length === 0}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white text-xs sm:text-sm font-medium hover:from-red-700 hover:to-red-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
              title="Export users"
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
          {/* View Mode Toggle - Hidden on mobile, shown on desktop */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => handleViewModeChange("users")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "users"
                  ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200/80 dark:ring-neutral-600"
                  : "text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Users
            </button>
            <button
              onClick={() => handleViewModeChange("metrics")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "metrics"
                  ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200/80 dark:ring-neutral-600"
                  : "text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
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

      {/* Search and Filters - Elevated Design - z-20 so dropdowns appear above the sticky table header */}
      <div className="relative z-20 bg-gradient-to-br from-white via-gray-50 to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-2 sm:p-4 lg:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 lg:gap-4">
          {/* Search Bar - Same row as filters, min-width prevents compression on laptop */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[280px] group flex items-center gap-2">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-neutral-500 group-focus-within:text-red-600 dark:group-focus-within:text-red-400 transition-colors w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <input
              type="text"
              placeholder="Search name, email or mobile..."
              value={filters.search || ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="w-full min-w-0 pl-8 sm:pl-10 lg:pl-12 pr-3 sm:pr-4 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white text-xs sm:text-sm lg:text-base shadow-sm hover:shadow-md transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-neutral-500"
            />
            {/* Mobile Filter Toggle Button */}
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="sm:hidden px-2.5 py-1.5 border-2 border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100 hover:border-red-500 hover:bg-red-50 dark:hover:bg-neutral-800 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
              aria-label="Toggle filters"
            >
              <Filter className={cn("w-4 h-4", hasActiveFilters ? "text-red-600" : "text-gray-600 dark:text-neutral-400")} />
              {hasActiveFilters && <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>}
              {isFiltersOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-600 dark:text-neutral-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-600 dark:text-neutral-400" />
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

            {/* States (multi-select) — width matches Dropdown (min-w-[220px] list) */}
            <div className="min-w-[100px] sm:min-w-[130px] lg:min-w-[150px]">
              <AdminStatesMultiSelect
                selected={filters.states}
                onChange={(codes) =>
                  setFilters((prev) => ({
                    ...prev,
                    states: codes,
                    page: 1,
                  }))
                }
              />
            </div>

            {/* Membership Streak filter (consecutive paid renewals) */}
            <div className="min-w-[100px] sm:min-w-[130px] lg:min-w-[150px]">
              <Dropdown
                options={[
                  { value: "", label: "Streak", icon: Flame },
                  { value: "1", label: "1+ renewals", icon: Flame },
                  { value: "2", label: "2+ renewals", icon: Flame },
                  { value: "4", label: "4+ renewals", icon: Flame },
                  { value: "6", label: "6+ renewals", icon: Flame },
                  { value: "8", label: "8+ renewals", icon: Flame },
                  { value: "10", label: "10+ renewals", icon: Flame },
                  { value: "12", label: "12+ (Founding)", icon: Flame },
                  { value: "none", label: "No streak", icon: Ban },
                ]}
                value={filters.streak || ""}
                onChange={(value) => updateFilter("streak", value)}
                placeholder="Streak"
                active={!!filters.streak}
              />
            </div>

            {/* Active major draw participation */}
            <div className="min-w-[100px] sm:min-w-[140px] lg:min-w-[160px]">
              <Dropdown
                options={[
                  { value: "", label: "Major draw", icon: Trophy },
                  { value: "yes", label: "In active draw", icon: CheckCircle },
                  { value: "no", label: "Not in draw", icon: Ban },
                ]}
                value={filters.inActiveMajorDraw || ""}
                onChange={(value) => updateFilter("inActiveMajorDraw", value)}
                placeholder="Major draw"
                active={!!filters.inActiveMajorDraw}
              />
            </div>

            {/*
              Mini draws — TWO dropdowns, not one, because they answer different questions and
              compose. "Bought a Mini Pack" is a lifetime purchase fact; "In an active mini draw"
              is where they stand right now. Crossing them is the useful part: bought a pack but
              NOT currently in a draw is a re-engagement segment, and neither dropdown alone can
              express it.
            */}
            <div className="min-w-[100px] sm:min-w-[150px] lg:min-w-[170px]">
              <Dropdown
                options={[
                  { value: "", label: "Mini pack", icon: Package },
                  { value: "yes", label: "Bought a Mini Pack", icon: CheckCircle },
                  { value: "no", label: "Never bought one", icon: Ban },
                ]}
                value={filters.miniDrawPackage || ""}
                onChange={(value) => updateFilter("miniDrawPackage", value)}
                placeholder="Mini pack"
                active={!!filters.miniDrawPackage}
              />
            </div>

            <div className="min-w-[100px] sm:min-w-[150px] lg:min-w-[170px]">
              <Dropdown
                options={[
                  { value: "", label: "Mini draw", icon: Gift },
                  { value: "yes", label: "In an active mini draw", icon: CheckCircle },
                  { value: "no", label: "Not in an active one", icon: Ban },
                ]}
                value={filters.inActiveMiniDraw || ""}
                onChange={(value) => updateFilter("inActiveMiniDraw", value)}
                placeholder="Mini draw"
                active={!!filters.inActiveMiniDraw}
              />
            </div>

            {/*
              Top 20% of entry holders in the ACTIVE major draw. Same `segment` param and same
              resolver the export uses, so filtering here then exporting gives the identical set.
              Ties at the cut are included, so this can return a little over 20% of holders.
            */}
            <div className="min-w-[100px] sm:min-w-[150px] lg:min-w-[170px]">
              <Dropdown
                options={[
                  { value: "", label: "Top holders", icon: Crown },
                  { value: "top20MajorDraw", label: "Top 20% of entries", icon: Crown },
                ]}
                value={filters.segment || ""}
                onChange={(value) => updateFilter("segment", value)}
                placeholder="Top holders"
                active={!!filters.segment}
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
                className="px-2 sm:px-3 py-1.5 sm:py-2 border-2 border-red-500/30 dark:border-red-500/40 bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:from-red-100 hover:to-red-200 dark:hover:from-red-950/60 dark:hover:to-red-900/50 hover:border-red-500/50 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
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
        <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
          <p>
            Showing {(usersData.pagination.currentPage - 1) * usersData.pagination.limit + 1} to{" "}
            {Math.min(usersData.pagination.currentPage * usersData.pagination.limit, usersData.pagination.totalCount)}{" "}
            of {usersData.pagination.totalCount} users
          </p>
        </div>
      )}

      {/* Users Table - z-10 so it stays below the filter bar (z-20) when dropdowns are open */}
      <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-800">
        {isLoading ? (
          // Enhanced Loading skeleton
          <div className="p-4 sm:p-6">
            <div className="space-y-3 sm:space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3 sm:space-x-4 animate-pulse">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 dark:bg-neutral-700 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-1/3 sm:w-1/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/2 sm:w-1/3"></div>
                  </div>
                  <div className="h-6 bg-gray-200 dark:bg-neutral-700 rounded w-16 sm:w-20 hidden sm:block"></div>
                  <div className="h-6 bg-gray-200 dark:bg-neutral-700 rounded w-20 sm:w-24 hidden md:block"></div>
                  <div className="h-6 bg-gray-200 dark:bg-neutral-700 rounded w-16 sm:w-20"></div>
                  <div className="h-8 bg-gray-200 dark:bg-neutral-700 rounded w-20 sm:w-24"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          // Enhanced Error state
          <div className="p-6 sm:p-8 text-center">
            <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">Error Loading Users</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-neutral-400 mb-4">
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
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">No Users Found</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-neutral-400">
              {filters.search || filters.subscriptionStatus || filters.role || (filters.states?.length ?? 0) > 0
                ? "Try adjusting your search criteria"
                : "No users have been registered yet"}
            </p>
          </div>
        ) : (
          // Enhanced Users table
          <>
            <div className="overflow-x-auto relative">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th
                      className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-2xs sm:text-xs lg:text-sm font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                      onClick={() => handleSort("createdAt")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        User
                        {getSortIcon("createdAt")}
                      </div>
                    </th>
                    <th className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-2xs sm:text-xs lg:text-sm font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wider">
                      Subscription
                    </th>
                    <th
                      className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-2xs sm:text-xs lg:text-sm font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                      onClick={() => handleSort("totalSpent")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Total Spent
                        {getSortIcon("totalSpent")}
                      </div>
                    </th>
                    <th
                      className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-2xs sm:text-xs lg:text-sm font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors hidden md:table-cell"
                      onClick={() => handleSort("majorDrawEntries")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Major Draw Entries
                        {getSortIcon("majorDrawEntries")}
                      </div>
                    </th>
                    <th
                      className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-2xs sm:text-xs lg:text-sm font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                      onClick={() => handleSort("miniDrawCount")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Mini Draws
                        {getSortIcon("miniDrawCount")}
                      </div>
                    </th>
                    <th
                      className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-2xs sm:text-xs lg:text-sm font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                      onClick={() => handleSort("lastLogin")}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                        Last Login
                        {getSortIcon("lastLogin")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-100 dark:divide-neutral-800">
                  {usersData.users.map((user) => {
                    const packageIcon = getPackageIconImage(user.subscription?.packageName);
                    const packageIconScaleClass = getPackageIconWrapperScaleClass(
                      derivePlanIdFromPackage(
                        { name: user.subscription?.packageName ?? "", type: "subscription" },
                        "subscription"
                      ),
                      "badge"
                    );
                    const colorScheme = getPackageColorScheme(user.subscription?.packageName);
                    const hasActiveSubscription = user.subscription?.isActive;
                    const borderGradientColor = colorScheme ? getGradientColor(colorScheme.gradient) : "#6b7280";
                    const isPremiumPackage =
                      user.subscription?.packageName?.toLowerCase().includes("boss") ||
                      user.subscription?.packageName?.toLowerCase().includes("power");

                    return (
                      <tr
                        key={user.id}
                        className={`hover:bg-gray-50 dark:hover:bg-neutral-800/80 transition-colors even:bg-gray-50/30 dark:even:bg-neutral-800/40 ${
                          canViewDetail ? "cursor-pointer" : ""
                        }`}
                        // Without `users.viewDetail` the row is inert: no handler, no pointer
                        // cursor, and a title saying why — rather than a click that opens a
                        // modal which then 403s on its own fetch.
                        onClick={canViewDetail ? () => handleUserClick(user) : undefined}
                        title={canViewDetail ? undefined : "You do not have permission to open customer details"}
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
                                <div
                                  className={cn("relative w-full h-full flex-shrink-0 flex items-center justify-center", packageIconScaleClass)}
                                >
                                  <Image
                                    src={packageIcon}
                                    alt={user.subscription?.packageName || "Package"}
                                    className="w-5 h-5 sm:w-7 sm:h-7 lg:w-9 lg:h-9 object-contain"
                                    width={36}
                                    height={36}
                                    sizes="(max-width: 640px) 20px, (max-width: 1024px) 28px, 36px"
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
                                  sizes="(max-width: 640px) 32px, (max-width: 1024px) 40px, 48px"
                                />
                              </div>
                            )}
                            <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0 flex-1">
                              <div className="text-2xs sm:text-xs lg:text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {formatDisplayName(user.firstName, user.lastName)}
                              </div>
                              <div className="text-3xs sm:text-xs lg:text-sm text-gray-500 dark:text-neutral-400 truncate">
                                {user.email}
                              </div>
                              <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 mt-0.5 sm:mt-1">
                                {user.isEmailVerified ? (
                                  <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-yellow-500 flex-shrink-0" />
                                )}
                                {user.role === "admin" && (
                                  <span className="text-3xs sm:text-2xs lg:text-xs text-gray-500 font-medium">
                                    Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
                          {renderAdminSubscriptionBadge(user)}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-2xs sm:text-xs lg:text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                          {formatCurrency(user.totalSpent)}
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap hidden md:table-cell">
                          <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 text-yellow-500 flex-shrink-0" />
                            <span className="text-2xs sm:text-xs lg:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                              {user.majorDrawEntries}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
                          <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                            <Gift className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 text-purple-500 flex-shrink-0" />
                            <span className="text-2xs sm:text-xs lg:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                              {user.miniDrawCount || 0}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-2xs sm:text-xs lg:text-sm text-gray-500 dark:text-neutral-400">
                          {user.lastLogin ? (
                            <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 flex-shrink-0 text-gray-400 dark:text-neutral-500" />
                              <span className="truncate">{formatDate(user.lastLogin)}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-neutral-500">Never</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Enhanced Pagination */}
            {usersData.pagination.totalPages > 1 && (
              <div className="bg-gray-50 dark:bg-neutral-800/50 px-4 sm:px-6 py-3 sm:py-4 border-t-2 border-gray-200 dark:border-neutral-700">
                <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => goToPage(1)}
                      disabled={!usersData.pagination.hasPrevPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="First page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => goToPage(usersData.pagination.currentPage - 1)}
                      disabled={!usersData.pagination.hasPrevPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-700 dark:text-neutral-300 font-medium">
                      Page {usersData.pagination.currentPage} of {usersData.pagination.totalPages}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => goToPage(usersData.pagination.currentPage + 1)}
                      disabled={!usersData.pagination.hasNextPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => goToPage(usersData.pagination.totalPages)}
                      disabled={!usersData.pagination.hasNextPage}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* User Export Modal */}
      {/* Charge Past Due Modal */}
      <ChargePastDueModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCompleted={() => {
          // Refresh the user list once the chunked run finishes.
          refetch();
        }}
      />

      <UserExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filters={filters}
        totalUsers={usersData?.pagination.totalCount}
      />

    </div>
  );
}
