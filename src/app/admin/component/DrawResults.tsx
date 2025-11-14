"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  Calendar,
  DollarSign,
  Users,
  Search,
  Download,
  Eye,
  UserPlus,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Edit,
} from "lucide-react";
import { Button, Input, Select } from "@/components/modals/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDateInAEST } from "@/utils/common/timezone";
import WinnerSelectionModal, { type WinnerSelectionData } from "@/components/modals/WinnerSelectionModal";
import ExportModal from "@/components/modals/ExportModal";

// Types
interface DrawResult {
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
  winner?: {
    userId: string;
    userDetails?: {
      firstName: string;
      lastName: string;
      email: string;
    };
    entryNumber: number;
    selectedDate: Date;
    notified: boolean;
    selectedBy?: string;
    selectedByDetails?: {
      firstName: string;
      lastName: string;
      email: string;
    };
    selectionMethod?: "manual" | "government-app";
  };
  createdAt: Date;
  updatedAt: Date;
}

interface DrawResultsResponse {
  success: boolean;
  data: {
    draws: DrawResult[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
      limit: number;
    };
    filters: {
      status?: string;
      hasWinner?: string;
      category?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy: string;
      sortOrder: string;
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
  { value: "completed", label: "Completed" },
  { value: "frozen", label: "Frozen" },
  { value: "active", label: "Active" },
  { value: "queued", label: "Queued" },
  { value: "cancelled", label: "Cancelled" },
];

const WINNER_OPTIONS = [
  { value: "", label: "All Draws" },
  { value: "true", label: "With Winner" },
  { value: "false", label: "Without Winner" },
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

export default function DrawResults() {
  const { showToast } = useToast();
  const [draws, setDraws] = useState<DrawResult[]>([]);
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
    status: "",
    hasWinner: "",
    category: "",
    search: "",
    sortBy: "drawDate",
    sortOrder: "desc",
  });

  // Modals
  const [selectedDraw, setSelectedDraw] = useState<DrawResult | null>(null);
  const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Fetch draws
  const fetchDraws = useCallback(
    async (page: number = 1) => {
      setIsLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams({
          page: page.toString(),
          limit: pagination.limit.toString(),
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          ...(filters.status && { status: filters.status }),
          ...(filters.hasWinner && { hasWinner: filters.hasWinner }),
          ...(filters.category && { category: filters.category }),
          ...(filters.search && { search: filters.search }),
        });

        const response = await fetch(`/api/admin/major-draw/history?${queryParams}`);
        const data: DrawResultsResponse = await response.json();

        if (data.success) {
          setDraws(data.data.draws);
          setPagination(data.data.pagination);
          setStats(data.data.stats);
        } else {
          throw new Error("Failed to fetch draws");
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

  // Handle winner selection
  const handleSelectWinner = (draw: DrawResult) => {
    setSelectedDraw(draw);
    setIsWinnerModalOpen(true);
  };

  const handleWinnerSelected = async (winnerData: WinnerSelectionData) => {
    if (winnerData.drawType !== "major") {
      return;
    }

    try {
      const response = await fetch("/api/admin/major-draw/select-winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          majorDrawId: winnerData.drawId,
          winnerUserId: winnerData.winnerUserId,
          entryNumber: winnerData.entryNumber,
          selectionMethod: winnerData.selectionMethod,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to record winner" }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Refresh the draws list
      await fetchDraws(pagination.currentPage);
      setIsWinnerModalOpen(false);
      setSelectedDraw(null);

      // Show success toast
      showToast({
        type: "success",
        title: "Winner Recorded Successfully!",
        message: `Winner has been recorded for ${selectedDraw?.name || "the draw"}.`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Error recording winner:", err);

      // Show error toast
      const errorMessage = err instanceof Error ? err.message : "Failed to record winner";
      showToast({
        type: "error",
        title: "Failed to Record Winner",
        message: errorMessage,
        duration: 7000,
      });

      throw err;
    }
  };

  // Handle export
  const handleExport = (draw: DrawResult) => {
    setSelectedDraw(draw);
    setIsExportModalOpen(true);
  };

  // Format date in AEST
  const formatDate = (date: Date | string) => {
    return formatDateInAEST(new Date(date), "dd MMM yyyy, hh:mm a");
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
      case "completed":
        return "bg-green-100 text-green-800";
      case "frozen":
        return "bg-blue-100 text-blue-800";
      case "active":
        return "bg-yellow-100 text-yellow-800";
      case "queued":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Get winner status
  const getWinnerStatus = (draw: DrawResult) => {
    // Check if there's actually a valid winner with userId
    if (draw.winner && draw.winner.userId) {
      return {
        icon: CheckCircle,
        color: "text-green-600",
        text: "Winner Selected",
        bgColor: "bg-green-50 border-green-200",
      };
    } else if (draw.status === "completed" || draw.status === "frozen") {
      return {
        icon: XCircle,
        color: "text-red-600",
        text: "No Winner",
        bgColor: "bg-red-50 border-red-200",
      };
    } else {
      return {
        icon: Clock,
        color: "text-gray-600",
        text: "Pending",
        bgColor: "bg-gray-50 border-gray-200",
      };
    }
  };

  if (isLoading && draws.length === 0) {
    return (
      <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-red-600 mx-auto mb-4" />
          <span className="text-lg text-gray-600 font-['Poppins']">Loading draws...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100 ">
      <div className="w-full mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">Draw Results</h1>
          <p className="text-lg text-gray-600 font-['Poppins']">Manage completed draws and winner selection</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Draws Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Total Draws</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1 font-['Poppins']">{stats.totalDraws}</h3>
            <p className="text-sm text-gray-600">Completed draws</p>
          </div>

          {/* Total Entries Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl">
                <Users className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Total Entries</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1 font-['Poppins']">
              {stats.totalEntries.toLocaleString()}
            </h3>
            <p className="text-sm text-gray-600">All entries combined</p>
          </div>

          {/* Total Prize Value Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Total Prize Value</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1 font-['Poppins']">
              {formatCurrency(stats.totalPrizeValue)}
            </h3>
            <p className="text-sm text-gray-600">Prize pool value</p>
          </div>

          {/* Winner Rate Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Winner Rate</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1 font-['Poppins']">{stats.winnerSelectionRate}%</h3>
            <p className="text-sm text-gray-600">Selection completion</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl">
              <Search className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 font-['Poppins']">Filter & Search</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="Search draws..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              icon={Search}
            />
            <Select
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              options={STATUS_OPTIONS}
            />
            <Select
              value={filters.hasWinner}
              onChange={(e) => handleFilterChange("hasWinner", e.target.value)}
              options={WINNER_OPTIONS}
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
                { value: "drawDate-desc", label: "Draw Date (Newest)" },
                { value: "drawDate-asc", label: "Draw Date (Oldest)" },
                { value: "createdAt-desc", label: "Created (Newest)" },
                { value: "createdAt-asc", label: "Created (Oldest)" },
                { value: "name-asc", label: "Name (A-Z)" },
                { value: "name-desc", label: "Name (Z-A)" },
                { value: "prize.value-desc", label: "Prize Value (High)" },
                { value: "prize.value-asc", label: "Prize Value (Low)" },
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
            const winnerStatus = getWinnerStatus(draw);
            const StatusIcon = winnerStatus.icon;

            return (
              <div key={draw._id} className="bg-white rounded-lg shadow border hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{draw.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(draw.status)}`}>
                          {draw.status.charAt(0).toUpperCase() + draw.status.slice(1)}
                        </span>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium border ${winnerStatus.bgColor}`}>
                          <StatusIcon className={`w-3 h-3 inline mr-1 ${winnerStatus.color}`} />
                          {winnerStatus.text}
                        </div>
                      </div>

                      <p className="text-gray-600 mb-3">{draw.description}</p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>Draw: {formatDate(draw.drawDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <DollarSign className="w-4 h-4" />
                          <span>{formatCurrency(draw.prize.value)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Users className="w-4 h-4" />
                          <span>{draw.totalEntries.toLocaleString()} entries</span>
                        </div>
                      </div>

                      {draw.winner && draw.winner.userId && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Trophy className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">Winner Details</span>
                          </div>
                          <p className="text-sm text-green-700">
                            {draw.winner.userDetails ? (
                              <>
                                {draw.winner.userDetails.firstName} {draw.winner.userDetails.lastName}(
                                {draw.winner.userDetails.email})
                              </>
                            ) : (
                              `User ID: ${draw.winner.userId}`
                            )}
                          </p>
                          <p className="text-xs text-green-600">
                            Entry #{draw.winner.entryNumber} • {formatDate(draw.winner.selectedDate)} •
                            {draw.winner.selectionMethod === "manual" ? "Manual" : "Government App"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      {(draw.status === "completed" || draw.status === "frozen") &&
                        (!draw.winner || !draw.winner.userId) && (
                          <Button onClick={() => handleSelectWinner(draw)} size="sm" icon={UserPlus}>
                            Select Winner
                          </Button>
                        )}
                      {draw.winner && draw.winner.userId && (
                        <Button onClick={() => handleSelectWinner(draw)} size="sm" variant="outline" icon={Edit}>
                          Edit Winner
                        </Button>
                      )}
                      <Button size="sm" variant="outline" icon={Eye}>
                        View Details
                      </Button>
                      <Button onClick={() => handleExport(draw)} size="sm" variant="outline" icon={Download}>
                        Export
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

        {/* Winner Selection Modal */}
        {selectedDraw && (
          <WinnerSelectionModal
            isOpen={isWinnerModalOpen}
            onClose={() => {
              setIsWinnerModalOpen(false);
              setSelectedDraw(null);
            }}
            onWinnerSelected={handleWinnerSelected}
            drawId={selectedDraw._id}
            drawName={selectedDraw.name}
            drawType="major"
            totalEntries={selectedDraw.totalEntries}
            currentWinner={
              selectedDraw.winner
                ? {
                    userId: selectedDraw.winner.userId,
                    entryNumber: selectedDraw.winner.entryNumber,
                    selectionMethod: selectedDraw.winner.selectionMethod || "government-app",
                  }
                : undefined
            }
          />
        )}

        {/* Export Modal */}
        {selectedDraw && (
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => {
              setIsExportModalOpen(false);
              setSelectedDraw(null);
            }}
            majorDrawId={selectedDraw._id}
            majorDrawName={selectedDraw.name}
            totalParticipants={selectedDraw.totalEntries}
          />
        )}
      </div>
    </div>
  );
}
