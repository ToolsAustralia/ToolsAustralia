/**
 * User List Component
 * Displays the users table with pagination
 */

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  Trophy,
  Gift,
  AlertTriangle,
  Users,
} from "lucide-react";
import type { UserFilters } from "@/types/admin";
import UserRow from "./UserRow";
import type { AdminUserListItem } from "@/types/admin";

interface UserListProps {
  users: AdminUserListItem[];
  filters: UserFilters;
  isLoading: boolean;
  error: Error | null;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  onUserClick: (user: AdminUserListItem) => void;
  onQuickAction: (action: string, userId: string) => void;
  onSort: (sortBy: UserFilters["sortBy"]) => void;
  onPageChange: (page: number) => void;
  onRefetch: () => void;
}

/**
 * Get sort icon for column header
 */
function getSortIcon(sortBy: UserFilters["sortBy"], currentSort: UserFilters["sortBy"], sortOrder: "asc" | "desc") {
  if (currentSort !== sortBy) {
    return null;
  }
  return sortOrder === "asc" ? (
    <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
  ) : (
    <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
  );
}

/**
 * User list table component with pagination
 */
export default function UserList({
  users,
  filters,
  isLoading,
  error,
  pagination,
  onUserClick,
  onQuickAction,
  onSort,
  onPageChange,
  onRefetch,
}: UserListProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6 sm:p-8 text-center">
          <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Error Loading Users</h3>
          <p className="text-sm sm:text-base text-gray-600 mb-4">
            {error instanceof Error ? error.message : "Failed to load users"}
          </p>
          <button
            onClick={onRefetch}
            className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!users.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6 sm:p-8 text-center">
          <Users className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Users Found</h3>
          <p className="text-sm sm:text-base text-gray-600">
            {filters.search || filters.subscriptionStatus || filters.role
              ? "Try adjusting your search criteria"
              : "No users have been registered yet"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b-2 border-gray-200">
            <tr>
              <th
                className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => onSort("createdAt")}
              >
                <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                  User
                  {getSortIcon("createdAt", filters.sortBy || "createdAt", filters.sortOrder || "desc")}
                </div>
              </th>
              <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Subscription
              </th>
              <th
                className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => onSort("totalSpent")}
              >
                <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                  Total Spent
                  {getSortIcon("totalSpent", filters.sortBy || "createdAt", filters.sortOrder || "desc")}
                </div>
              </th>
              <th
                className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors hidden md:table-cell"
                onClick={() => onSort("majorDrawEntries")}
              >
                <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                  Major Draw Entries
                  {getSortIcon("majorDrawEntries", filters.sortBy || "createdAt", filters.sortOrder || "desc")}
                </div>
              </th>
              <th
                className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => onSort("miniDrawCount")}
              >
                <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                  Mini Draws
                  {getSortIcon("miniDrawCount", filters.sortBy || "createdAt", filters.sortOrder || "desc")}
                </div>
              </th>
              <th
                className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-3 text-left text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => onSort("lastLogin")}
              >
                <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
                  Last Login
                  {getSortIcon("lastLogin", filters.sortBy || "createdAt", filters.sortOrder || "desc")}
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
            {users.map((user) => (
              <UserRow key={user.id} user={user} onUserClick={onUserClick} onQuickAction={onQuickAction} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 border-t-2 border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => onPageChange(1)}
                disabled={!pagination.hasPrevPage}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => onPageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-700 font-medium">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => onPageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onPageChange(pagination.totalPages)}
                disabled={!pagination.hasNextPage}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Last page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



