"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, Users, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, User } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { useAdminUsers } from "@/hooks/queries/useAdminQueries";
import type { UserFilters } from "@/types/admin";
import { format } from "date-fns";

type StatusFilter = "active" | "cancelled" | "past_due";

interface MembershipByPackageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageId: string;
  packageName: string;
  /** When opening for "All" (e.g. Past due or Expected renewing), set initial toggle */
  initialStatusFilter?: StatusFilter;
  onUserClick?: (userId: string) => void;
}

const statusLabels: Record<StatusFilter, string> = {
  active: "Active",
  cancelled: "Cancelled",
  past_due: "Past due",
};

export default function MembershipByPackageDetailModal({
  isOpen,
  onClose,
  packageId: _packageId,
  packageName,
  initialStatusFilter,
  onUserClick,
}: MembershipByPackageDetailModalProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter ?? "active");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 300);
  const limit = 20;

  const filters: UserFilters = useMemo(() => {
    const base: UserFilters = {
      page,
      limit,
      search: debouncedSearch || undefined,
      sortBy: "createdAt",
      sortOrder: "desc",
    };
    if (packageName && packageName !== "All") {
      base.membershipPackage = packageName;
    }
    if (statusFilter === "active") {
      base.subscriptionStatus = "active";
    } else if (statusFilter === "past_due") {
      base.subscriptionStatus = "past_due";
    } else {
      base.autoRenew = "false";
    }
    return base;
  }, [packageName, statusFilter, page, limit, debouncedSearch]);

  const { data, isLoading, error } = useAdminUsers(filters, { enabled: isOpen });

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setPage(1);
    } else {
      if (initialStatusFilter !== undefined) setStatusFilter(initialStatusFilter);
      else if (packageName && packageName !== "All") setStatusFilter("active");
    }
  }, [isOpen, initialStatusFilter, packageName]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const users = data?.users ?? [];
  const pagination = data?.pagination;
  const totalCount = pagination?.totalCount ?? 0;

  const formatDate = (dateString: string | undefined) =>
    dateString ? format(new Date(dateString), "MMM d, yyyy") : "—";

  const getStatusLabel = () => {
    if (statusFilter === "active") return "Active";
    if (statusFilter === "past_due") return "Past due";
    return "Cancelled";
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1000px]">
      <ModalHeader
        title={packageName === "All" ? `All packages – ${getStatusLabel()}` : `${packageName} – Members`}
        subtitle={
          data
            ? `${totalCount.toLocaleString()} ${statusLabels[statusFilter].toLowerCase()}`
            : "Loading..."
        }
        onClose={onClose}
      />

      {/* Toggle: Active | Cancelled | Past due */}
      <div className="px-4 sm:px-6 pt-2 pb-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-2">
          {(["active", "cancelled", "past_due"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                statusFilter === status
                  ? "bg-red-600 text-white shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            disabled={isLoading}
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
          />
        </div>
      </div>

      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 m-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-2">
              <span className="text-red-700 text-sm">Failed to load members.</span>
            </div>
          )}

          {isLoading && !data && (
            <div className="p-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-gray-400 animate-spin" />
              <p className="text-gray-600">Loading members...</p>
            </div>
          )}

          {!isLoading && data && users.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No members found</p>
              <p className="text-sm mt-1">
                {searchQuery.trim() ? "Try a different search" : `No ${statusLabels[statusFilter].toLowerCase()} members for this package`}
              </p>
            </div>
          )}

          {data && users.length > 0 && (
            <div className="p-4">
              {/* Results summary - same as users table */}
              {pagination && (
                <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 mb-4">
                  <p>
                    Showing {(pagination.currentPage - 1) * (pagination.limit ?? 10) + 1} to{" "}
                    {Math.min(pagination.currentPage * (pagination.limit ?? 10), totalCount)} of {totalCount} users
                  </p>
                </div>
              )}
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-12 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4 text-sm font-semibold text-gray-700">
                <div className="col-span-3">Name</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">End date</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
                  >
                    <div className="p-4 flex flex-col sm:grid sm:grid-cols-12 gap-4 items-start sm:items-center">
                      <div className="col-span-3 min-w-0">
                        <p className="font-semibold text-gray-900">
                          {user.firstName} {user.lastName}
                        </p>
                        {user.mobile && <p className="text-xs text-gray-500 sm:hidden">{user.mobile}</p>}
                      </div>
                      <div className="col-span-3 text-sm text-gray-600 truncate">{user.email}</div>
                      <div className="col-span-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            statusFilter === "past_due"
                              ? "bg-amber-100 text-amber-800"
                              : statusFilter === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                          }`}
                        >
                          {getStatusLabel()}
                        </span>
                      </div>
                      <div className="col-span-2 text-sm text-gray-600">
                        {formatDate(user.subscription?.endDate)}
                      </div>
                      <div className="col-span-2 w-full sm:w-auto sm:text-right">
                        {onUserClick && (
                          <button
                            type="button"
                            onClick={() => onUserClick(user.id)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors w-full sm:w-auto justify-center"
                          >
                            <User className="w-4 h-4" />
                            View user
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination - same design as users table */}
              {pagination && pagination.totalPages > 1 && (
                <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 border-t-2 border-gray-200 -mx-6 -mb-6 mt-6">
                  <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => setPage(1)}
                        disabled={!pagination.hasPrevPage || isLoading}
                        className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={!pagination.hasPrevPage || isLoading}
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
                        type="button"
                        onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                        disabled={!pagination.hasNextPage || isLoading}
                        className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage(pagination.totalPages)}
                        disabled={!pagination.hasNextPage || isLoading}
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
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
