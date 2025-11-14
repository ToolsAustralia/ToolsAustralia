"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  Download,
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
} from "lucide-react";
import { AdminUserListItem, UserFilters } from "@/types/admin";
import { useAdminUsers, useAdminUserActions } from "@/hooks/queries/useAdminQueries";
import UserDetailModal from "./UserDetailModal";
import { useDebounce } from "@/hooks/useDebounce";

/**
 * Main Users Management component with search, filtering, and user table
 * Provides comprehensive user management interface for admins
 */
export default function UsersManagement() {
  // State management
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 25,
    search: "",
    subscriptionStatus: undefined,
    role: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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

  // Handle filter changes
  const updateFilter = (key: keyof UserFilters, value: string | number) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filters change
    }));
  };

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
    }).format(amount); // Amount is already in dollars
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get subscription status badge
  const getSubscriptionBadge = (user: AdminUserListItem) => {
    if (!user.subscription) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">No Subscription</span>
      );
    }

    if (user.subscription.isActive) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>;
    }

    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Inactive</span>;
  };

  // Get user status badge
  const getUserStatusBadge = (user: AdminUserListItem) => {
    if (user.isActive) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>;
    }

    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Inactive</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Manage user accounts, subscriptions, and activity</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              showFilters
                ? "border-[#ee0000] bg-red-50 text-[#ee0000]"
                : "border-gray-300 text-gray-700 hover:border-gray-400"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={filters.search || ""}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subscription Status</label>
              <select
                value={filters.subscriptionStatus || ""}
                onChange={(e) => updateFilter("subscriptionStatus", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              >
                <option value="">All Subscriptions</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="none">No Subscription</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User Role</label>
              <select
                value={filters.role || ""}
                onChange={(e) => updateFilter("role", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              >
                <option value="">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <select
                value={filters.sortBy || "createdAt"}
                onChange={(e) => updateFilter("sortBy", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              >
                <option value="createdAt">Date Joined</option>
                <option value="email">Email</option>
                <option value="lastLogin">Last Login</option>
                <option value="totalSpent">Total Spent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Items Per Page</label>
              <select
                value={filters.limit || 25}
                onChange={(e) => updateFilter("limit", parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results Summary */}
      {usersData && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>
            Showing {(usersData.pagination.currentPage - 1) * usersData.pagination.limit + 1} to{" "}
            {Math.min(usersData.pagination.currentPage * usersData.pagination.limit, usersData.pagination.totalCount)}{" "}
            of {usersData.pagination.totalCount} users
          </p>
          <button onClick={() => refetch()} className="text-[#ee0000] hover:text-[#cc0000] transition-colors">
            Refresh
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {isLoading ? (
          // Loading skeleton
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 animate-pulse">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-20"></div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                  <div className="h-8 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          // Error state
          <div className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Users</h3>
            <p className="text-gray-600 mb-4">{error instanceof Error ? error.message : "Failed to load users"}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
            >
              Try Again
            </button>
          </div>
        ) : !usersData?.users.length ? (
          // Empty state
          <div className="p-6 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Users Found</h3>
            <p className="text-gray-600">
              {filters.search || filters.subscriptionStatus || filters.role
                ? "Try adjusting your search criteria"
                : "No users have been registered yet"}
            </p>
          </div>
        ) : (
          // Users table
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subscription
                    </th>
                    <th
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("totalSpent")}
                    >
                      <div className="flex items-center gap-1">
                        Total Spent
                        {filters.sortBy === "totalSpent" && (
                          <span className="text-[#ee0000]">{filters.sortOrder === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Major Draw Entries
                    </th>
                    <th
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("lastLogin")}
                    >
                      <div className="flex items-center gap-1">
                        Last Login
                        {filters.sortBy === "lastLogin" && (
                          <span className="text-[#ee0000]">{filters.sortOrder === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {usersData.users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleUserClick(user)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-r from-[#ee0000] to-[#ff4444] rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {user.firstName.charAt(0).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {user.isEmailVerified ? (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-3 h-3 text-yellow-500" />
                              )}
                              <span className="text-xs text-gray-500">{user.role === "admin" && "Admin"}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getSubscriptionBadge(user)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(user.totalSpent)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm font-medium text-gray-900">{user.majorDrawEntries}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.lastLogin ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(user.lastLogin)}
                          </div>
                        ) : (
                          "Never"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getUserStatusBadge(user)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUserClick(user);
                            }}
                            className="text-[#ee0000] hover:text-[#cc0000] transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAction("resend_verification", user.id);
                            }}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Resend Verification"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAction("reset_password", user.id);
                            }}
                            className="text-yellow-600 hover:text-yellow-800 transition-colors"
                            title="Reset Password"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {usersData.pagination.totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(1)}
                      disabled={!usersData.pagination.hasPrevPage}
                      className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => goToPage(usersData.pagination.currentPage - 1)}
                      disabled={!usersData.pagination.hasPrevPage}
                      className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">
                      Page {usersData.pagination.currentPage} of {usersData.pagination.totalPages}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(usersData.pagination.currentPage + 1)}
                      disabled={!usersData.pagination.hasNextPage}
                      className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => goToPage(usersData.pagination.totalPages)}
                      disabled={!usersData.pagination.hasNextPage}
                      className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* User Detail Modal */}
      <UserDetailModal
        userId={selectedUserId}
        isOpen={isDetailModalOpen}
        onCloseAction={() => {
          setIsDetailModalOpen(false);
          setSelectedUserId(null);
        }}
      />
    </div>
  );
}
