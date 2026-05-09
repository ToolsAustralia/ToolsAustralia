"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui";

interface PaginationProps {
  /** True when API total > 50 (server pagination active). */
  isServerPaginationActive: boolean;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  currentPage: number;
  totalPages: number;
  page: number;
  onPageChange: (next: number) => void;
  isLoading: boolean;
}

const Pagination: React.FC<PaginationProps> = ({
  isServerPaginationActive,
  filteredCount,
  totalCount,
  hasActiveFilters,
  currentPage,
  totalPages,
  page,
  onPageChange,
  isLoading,
}) => {
  if (isServerPaginationActive) {
    return (
      <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-neutral-800 pt-4">
        <div className="text-sm text-gray-600 dark:text-neutral-300">
          {filteredCount > 0 ? (
            <>
              Showing {filteredCount} user{filteredCount !== 1 ? "s" : ""} on this page
              {hasActiveFilters && totalCount > filteredCount && (
                <span className="text-gray-500 dark:text-neutral-500 ml-1">
                  (filtered from {totalCount.toLocaleString()} total)
                </span>
              )}
              {!hasActiveFilters && (
                <span className="text-gray-500 dark:text-neutral-500 ml-1">
                  (of {totalCount.toLocaleString()} total)
                </span>
              )}
            </>
          ) : (
            "No users found"
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1 || isLoading}
            size="sm"
            variant="outline"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="text-sm text-gray-600 dark:text-neutral-300">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || isLoading}
            size="sm"
            variant="outline"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Show pagination info when there are filtered results but no API pagination needed
  if (filteredCount > 0) {
    return (
      <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-neutral-800 pt-4">
        <div className="text-sm text-gray-600 dark:text-neutral-300">
          Showing {filteredCount} user{filteredCount !== 1 ? "s" : ""}
          {hasActiveFilters && totalCount > filteredCount && (
            <span className="text-gray-500 dark:text-neutral-500 ml-1">
              (filtered from {totalCount.toLocaleString()} total)
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default Pagination;
