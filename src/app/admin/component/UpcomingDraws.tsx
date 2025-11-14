"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Edit,
  Eye,
  Clock,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Users,
  DollarSign,
  Trophy,
} from "lucide-react";
import { Button, Input, Select } from "@/components/modals/ui";
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
        return "bg-gray-100 text-gray-800";
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
      <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-red-600 mx-auto mb-4" />
          <span className="text-lg text-gray-600 font-['Poppins']">Loading upcoming draws...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100 ">
      <div className="w-full mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Upcoming Draws
            </h2>
            <p className="text-gray-600 mt-1">Manage and edit queued and active draws</p>
          </div>
          <Button
            onClick={() => fetchDraws(pagination.currentPage)}
            disabled={isLoading}
            variant="outline"
            icon={RefreshCw}
          >
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Draws</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalDraws}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Entries</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalEntries.toLocaleString()}</p>
              </div>
              <Users className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Prize Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalPrizeValue)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Winner Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats.winnerSelectionRate}%</p>
              </div>
              <Trophy className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Draws List */}
        <div className="space-y-4">
          {draws.map((draw) => {
            const StatusIcon = getStatusIcon(draw.status);
            const canEdit = canEditDraw(draw);

            return (
              <div key={draw._id} className="bg-white rounded-lg shadow border hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
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

                      <p className="text-gray-600 mb-3">{draw.description}</p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>Activation: {formatDate(draw.activationDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>Draw: {formatDate(draw.drawDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
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

                    <div className="flex flex-col gap-2 ml-4">
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
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.hasPrevPage || isLoading}
            >
              Previous
            </Button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNextPage || isLoading}
            >
              Next
            </Button>
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
    </div>
  );
}
