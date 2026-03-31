/**
 * Users Management Component
 * Main container for user management feature
 * Coordinates filters, list, and stats
 */

"use client";

import React, { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import type { UserFilters, AdminUserListItem } from "@/types/admin";
import { useUsers } from "../hooks/useUsers";
import { useUserActions } from "../hooks/useUserActions";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { Users, CreditCard, CheckCircle, Shield } from "lucide-react";
import UserFiltersComponent from "./UserFilters";
import UserList from "./UserList";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import KlaviyoSyncButton from "./KlaviyoSyncButton";

/**
 * Main users management component
 * Handles state management and coordinates child components
 */
export default function UsersManagement() {
  // Filter state
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 25,
    search: "",
    subscriptionStatus: undefined,
    membershipPackage: undefined,
    role: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const { openUserModal } = useAdminUserModal();

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
  const { data: usersData, isLoading, error, refetch } = useUsers(queryFilters);

  const userActions = useUserActions();

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
    const conversionRate = totalUsers > 0 ? Math.round((conversions / totalUsers) * 100 * 10) / 10 : 0;

    return {
      totalUsers,
      activeSubscriptions: usersData.stats.activeSubscriptions || 0,
      verifiedUsers: usersData.stats.verifiedUsers || 0,
      conversions,
      conversionRate,
    };
  }, [usersData]);

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
    setFilters((prev) => ({
      ...prev,
      sortBy,
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === "asc" ? "desc" : "asc",
    }));
  };

  // Handle user row click
  const handleUserClick = (user: AdminUserListItem) => {
    openUserModal(user.id);
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
          User Management
        </h2>
        <KlaviyoSyncButton />
      </div>

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

      {/* Search and Filters */}
      <UserFiltersComponent
        filters={filters}
        onFilterChange={updateFilter}
        onClearFilters={clearAllFilters}
        hasActiveFilters={hasActiveFilters}
      />

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

      {/* Users Table */}
      <UserList
        users={usersData?.users || []}
        filters={filters}
        isLoading={isLoading}
        error={error}
        pagination={
          usersData?.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 25,
            hasNextPage: false,
            hasPrevPage: false,
          }
        }
        onUserClick={handleUserClick}
        onQuickAction={handleQuickAction}
        onSort={handleSort}
        onPageChange={goToPage}
        onRefetch={refetch}
      />

    </div>
  );
}





