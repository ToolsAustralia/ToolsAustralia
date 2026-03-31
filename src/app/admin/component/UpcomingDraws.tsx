"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Edit,
  Eye,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Users,
  DollarSign,
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button, Input, Select } from "@/components/modals/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useToast } from "@/components/ui/Toast";
import MajorDrawEditModal from "@/components/modals/MajorDrawEditModal";
import { formatDateInLocal } from "@/utils/common/timezone";

// Import the MajorDrawData type from the modal
interface MajorDrawData {
  _id: string;
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: (string | File)[];
    specifications?: Record<string, string | number | string[]>;
    brand?: string;
    components?: Array<{
      title: string;
      description: string;
      icon?: string;
    }>;
    terms?: string[];
  };
  drawDate: string;
  activationDate: string;
  freezeEntriesAt: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  configurationLocked: boolean;
}

// Types
interface UpcomingDraw {
  _id: string;
  name: string;
  description: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  startDate: Date;
  endDate: Date;
  drawDate: Date;
  activationDate: Date;
  freezeEntriesAt: Date;
  configurationLocked: boolean;
  lockedAt?: Date;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
    brand?: string;
    model?: string;
    condition?: string;
    warranty?: string;
    delivery?: {
      method: string;
      timeframe: string;
      restrictions?: string;
    };
    terms?: string[];
  };
  totalEntries: number;
  createdAt: Date;
  updatedAt: Date;
}

interface UpcomingDrawsResponse {
  success: boolean;
  data: {
    draws: UpcomingDraw[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
      limit: number;
    };
    stats: {
      totalDraws: number;
      totalEntries: number;
      totalPrizeValue: number;
      drawsWithWinners: number;
      drawsWithoutWinners: number;
      winnerSelectionRate: number;
    };
  };
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "queued", label: "Queued" },
  { value: "active", label: "Active" },
  { value: "queued,active", label: "Queued & Active" },
  { value: "frozen", label: "Frozen" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "vehicle", label: "Vehicle" },
  { value: "electronics", label: "Electronics" },
  { value: "travel", label: "Travel" },
  { value: "cash", label: "Cash" },
  { value: "experience", label: "Experience" },
  { value: "home", label: "Home & Garden" },
  { value: "fashion", label: "Fashion" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
];

export default function UpcomingDraws() {
  const { showToast } = useToast();
  const [draws, setDraws] = useState<UpcomingDraw[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
    limit: 20,
  });
  const [stats, setStats] = useState({
    totalDraws: 0,
    totalEntries: 0,
    totalPrizeValue: 0,
    drawsWithWinners: 0,
    drawsWithoutWinners: 0,
    winnerSelectionRate: 0,
  });

  // Filters
  const [filters, setFilters] = useState({
    status: "queued,active", // Default to show queued and active draws
    category: "",
    search: "",
    sortBy: "drawDate", // Use valid sort option
    sortOrder: "asc",
  });

  // Modals
  const [selectedDraw, setSelectedDraw] = useState<UpcomingDraw | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch draws
  const fetchDraws = useCallback(
    async (page: number = 1) => {
      setIsLoading(true);
      setError(null);

      try {
        // Handle combined status filter (queued,active)
        if (filters.status === "queued,active") {
          // Make two separate API calls and combine results
          const [queuedResponse, activeResponse] = await Promise.all([
            fetch(
              `/api/admin/major-draw/history?${new URLSearchParams({
                page: page.toString(),
                limit: pagination.limit.toString(),
                sortBy: filters.sortBy,
                sortOrder: filters.sortOrder,
                status: "queued",
                ...(filters.category && { category: filters.category }),
                ...(filters.search && { search: filters.search }),
              })}`
            ),
            fetch(
              `/api/admin/major-draw/history?${new URLSearchParams({
                page: page.toString(),
                limit: pagination.limit.toString(),
                sortBy: filters.sortBy,
                sortOrder: filters.sortOrder,
                status: "active",
                ...(filters.category && { category: filters.category }),
                ...(filters.search && { search: filters.search }),
              })}`
            ),
          ]);

          if (!queuedResponse.ok || !activeResponse.ok) {
            throw new Error("Failed to fetch draws");
          }

          const [queuedData, activeData] = await Promise.all([queuedResponse.json(), activeResponse.json()]);

          if (queuedData.success && activeData.success) {
            // Combine draws from both responses
            const combinedDraws = [...queuedData.data.draws, ...activeData.data.draws];

            // Combine stats
            const combinedStats = {
              totalDraws: queuedData.data.stats.totalDraws + activeData.data.stats.totalDraws,
              totalEntries: queuedData.data.stats.totalEntries + activeData.data.stats.totalEntries,
              totalPrizeValue: queuedData.data.stats.totalPrizeValue + activeData.data.stats.totalPrizeValue,
              drawsWithWinners: queuedData.data.stats.drawsWithWinners + activeData.data.stats.drawsWithWinners,
              drawsWithoutWinners:
                queuedData.data.stats.drawsWithoutWinners + activeData.data.stats.drawsWithoutWinners,
              winnerSelectionRate: 0, // Will be calculated below
            };

            // Calculate combined winner selection rate
            const totalDrawsWithWinners = combinedStats.drawsWithWinners + combinedStats.drawsWithoutWinners;
            if (totalDrawsWithWinners > 0) {
              combinedStats.winnerSelectionRate = Math.round(
                (combinedStats.drawsWithWinners / totalDrawsWithWinners) * 100
              );
            }

            setDraws(combinedDraws);
            setPagination(queuedData.data.pagination); // Use queued pagination as base
            setStats(combinedStats);
          } else {
            throw new Error("Failed to fetch draws");
          }
        } else {
          // Single status filter
          const queryParams = new URLSearchParams({
            page: page.toString(),
            limit: pagination.limit.toString(),
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder,
            ...(filters.status && filters.status !== "queued,active" && { status: filters.status }),
            ...(filters.category && { category: filters.category }),
            ...(filters.search && { search: filters.search }),
          });

          const response = await fetch(`/api/admin/major-draw/history?${queryParams}`);

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          const data: UpcomingDrawsResponse = await response.json();

          if (data.success) {
            setDraws(data.data.draws);
            setPagination(data.data.pagination);
            setStats(data.data.stats);
          } else {
            throw new Error("Failed to fetch draws");
          }
        }
      } catch (err) {
        console.error("Error fetching draws:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch draws");
      } finally {
        setIsLoading(false);
      }
    },
    [filters, pagination.limit]
  );

  // Initial load
  useEffect(() => {
    fetchDraws();
  }, [fetchDraws]);

  // Handle filter changes
  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    fetchDraws(newPage);
  };

  // Convert UpcomingDraw to MajorDrawData format for the modal
  const convertToMajorDrawData = (draw: UpcomingDraw) => {
    return {
      _id: draw._id,
      name: draw.name,
      description: draw.description,
      prize: draw.prize,
      drawDate: draw.drawDate instanceof Date ? draw.drawDate.toISOString() : draw.drawDate,
      activationDate: draw.activationDate instanceof Date ? draw.activationDate.toISOString() : draw.activationDate,
      freezeEntriesAt: draw.freezeEntriesAt instanceof Date ? draw.freezeEntriesAt.toISOString() : draw.freezeEntriesAt,
      status: draw.status,
      configurationLocked: draw.configurationLocked,
    };
  };

  // Handle edit draw
  const handleEditDraw = (draw: UpcomingDraw) => {
    setSelectedDraw(draw);
    setIsEditModalOpen(true);
  };

  // Handle save draw - accepts MajorDrawData format from modal
  const handleSaveDraw = async (data: Partial<MajorDrawData>) => {
    if (!selectedDraw) return;

    setIsSubmitting(true);
    try {
      // Data is already in the correct format from the modal
      const apiData = data;

      const response = await fetch(`/api/admin/major-draw/update?id=${selectedDraw._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to update draw" }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Refresh the draws list
      await fetchDraws(pagination.currentPage);
      setIsEditModalOpen(false);
      setSelectedDraw(null);

      // Show success toast
      showToast({
        type: "success",
        title: "Draw Updated Successfully!",
        message: `${selectedDraw.name} has been updated and changes are now live.`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Error updating draw:", err);

      // Show error toast
      const errorMessage = err instanceof Error ? err.message : "Failed to update draw";
      showToast({
        type: "error",
        title: "Failed to Update Draw",
        message: errorMessage,
        duration: 7000,
      });

      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format date for the current viewer's timezone
  const formatDate = (date: Date | string) => {
    return formatDateInLocal(new Date(date), "dd MMM yyyy, hh:mm a");
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "frozen":
        return "bg-blue-100 text-blue-800";
      case "queued":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800 dark:text-neutral-100";
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return CheckCircle;
      case "frozen":
        return Clock;
      case "queued":
        return Clock;
      case "cancelled":
        return XCircle;
      default:
        return Clock;
    }
  };

  // Check if draw can be edited
  const canEditDraw = (draw: UpcomingDraw) => {
    // Allow editing of queued and active draws, but not if configuration is locked
    return (draw.status === "queued" || draw.status === "active") && !draw.configurationLocked;
  };

  if (isLoading && draws.length === 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
            Upcoming Draws
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-3 sm:p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2 w-1/2"></div>
              <div className="h-8 bg-gray-200 rounded mb-2 w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-4 sm:p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      
     

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total Draws"
          value={stats.totalDraws}
          icon={Calendar}
          color="blue"
        />
        <MetricCard
          title="Total Entries"
          value={stats.totalEntries.toLocaleString()}
          icon={Users}
          color="emerald"
        />
        <MetricCard
          title="Total Prize Value"
          value={formatCurrency(stats.totalPrizeValue)}
          icon={DollarSign}
          color="yellow"
        />
        <MetricCard
          title="Winner Rate"
          value={`${stats.winnerSelectionRate}%`}
          icon={Trophy}
          color="purple"
        />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Filter & Search</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Input
              placeholder="Search draws..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
            />
            <Select
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              options={STATUS_OPTIONS}
            />
            <Select
              value={filters.category}
              onChange={(e) => handleFilterChange("category", e.target.value)}
              options={CATEGORY_OPTIONS}
            />
            <Select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split("-");
                setFilters((prev) => ({ ...prev, sortBy, sortOrder }));
              }}
              options={[
                { value: "drawDate-asc", label: "Draw Date (Earliest)" },
                { value: "drawDate-desc", label: "Draw Date (Latest)" },
                { value: "createdAt-desc", label: "Created (Newest)" },
                { value: "createdAt-asc", label: "Created (Oldest)" },
                { value: "name-asc", label: "Name (A-Z)" },
                { value: "name-desc", label: "Name (Z-A)" },
                { value: "prize.value-desc", label: "Prize Value (Highest)" },
                { value: "prize.value-asc", label: "Prize Value (Lowest)" },
              ]}
            />
          </div>
        </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Draws List */}
      <div className="space-y-3 sm:space-y-4">
        {draws.map((draw) => {
          const StatusIcon = getStatusIcon(draw.status);
          const canEdit = canEditDraw(draw);

          return (
            <div key={draw._id} className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{draw.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(draw.status)}`}>
                          <StatusIcon className="w-3 h-3 inline mr-1" />
                          {draw.status.charAt(0).toUpperCase() + draw.status.slice(1)}
                        </span>
                        {draw.configurationLocked && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            Locked
                          </span>
                        )}
                      </div>

                      <div
                        className="text-gray-600 dark:text-neutral-400 mb-3 [&_p]:my-0"
                        dangerouslySetInnerHTML={{ __html: draw.description || "" }}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
                          <Calendar className="w-4 h-4" />
                          <span>Activation: {formatDate(draw.activationDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
                          <Calendar className="w-4 h-4" />
                          <span>Draw: {formatDate(draw.drawDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
                          <Calendar className="w-4 h-4" />
                          <span>Prize: {formatCurrency(draw.prize.value)}</span>
                        </div>
                      </div>

                      {!canEdit && (draw.status === "queued" || draw.status === "active") && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600" />
                            <span className="text-sm text-yellow-800">
                              This draw&apos;s configuration is locked and cannot be edited.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                <div className="flex flex-wrap gap-2 sm:flex-col sm:flex-shrink-0">
                  {canEdit && (
                    <Button onClick={() => handleEditDraw(draw)} size="sm" icon={Edit}>
                      Edit Draw
                    </Button>
                  )}
                  <Button size="sm" variant="outline" icon={Eye}>
                    Preview
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={!pagination.hasPrevPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs sm:text-sm text-gray-700 dark:text-neutral-200 font-medium">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.totalPages)}
                disabled={!pagination.hasNextPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Last page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {selectedDraw && (
        <MajorDrawEditModal
          isOpen={isEditModalOpen}
          onCloseAction={() => {
            setIsEditModalOpen(false);
            setSelectedDraw(null);
          }}
          onSaveAction={handleSaveDraw}
          majorDraw={convertToMajorDrawData(selectedDraw)}
          isLoading={isSubmitting}
        />
      )}
    </div>
  );
}
