"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  Calendar,
  DollarSign,
  Users,
  Search,
  Download,
  UserPlus,
  UserX,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Edit,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button, Input, Select } from "@/components/modals/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useToast } from "@/components/ui/Toast";
import { formatDateInAEST } from "@/utils/common/timezone";
import WinnerSelectionModal, { type WinnerSelectionData } from "@/components/modals/WinnerSelectionModal";
import WinnerEditModal from "@/components/modals/WinnerEditModal";
import ExportModal from "@/components/modals/ExportModal";
import MajorDrawEditModal from "@/components/modals/MajorDrawEditModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";

// Import MajorDrawData type from modal
type MajorDrawData = {
  _id: string;
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: (string | File)[];
    brand?: string;
    specifications?: Record<string, string | number | string[]>;
    terms?: string[];
  };
  drawDate: string;
  activationDate: string;
  freezeEntriesAt: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  configurationLocked: boolean;
};

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
    winnerId?: string;
    userId: string;
    userDetails?: {
      firstName: string;
      lastName: string;
      email: string;
    };
    entryNumber: number;
    selectedDate: Date;
    selectedBy?: string;
    selectedByDetails?: {
      firstName: string;
      lastName: string;
      email: string;
    };
    selectionMethod?: "manual" | "government-app";
    imageUrl?: string;
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
  const [isEditWinnerModalOpen, setIsEditWinnerModalOpen] = useState(false);
  const [editingWinner, setEditingWinner] = useState<{
    winnerId: string;
    winnerName: string;
    testimony?: string | null;
    selectedPrize?: string | null;
    imageUrl?: string | null;
  } | null>(null);
  // Edit Draw Modal
  const [editingDraw, setEditingDraw] = useState<DrawResult | null>(null);
  const [isEditDrawModalOpen, setIsEditDrawModalOpen] = useState(false);
  const [isSubmittingDraw, setIsSubmittingDraw] = useState(false);
  const [removeWinnerTarget, setRemoveWinnerTarget] = useState<DrawResult | null>(null);
  const [isRemovingWinner, setIsRemovingWinner] = useState(false);

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

  // Handle edit winner - fetch winner details and open edit modal
  const handleEditWinner = async (draw: DrawResult) => {
    if (!draw.winner || !draw.winner.userId) return;

    try {
      // First, find the winner document ID by querying all winners
      const allWinnersResponse = await fetch(`/api/winners/all?drawType=major&limit=100`);
      if (allWinnersResponse.ok) {
        const allWinnersData = await allWinnersResponse.json();
        if (allWinnersData.success && allWinnersData.winners) {
          const winnerForDraw = allWinnersData.winners.find(
            (w: { drawId: string; drawType: string }) =>
              w.drawId === draw._id && w.drawType === "major"
          );

          if (winnerForDraw) {
            // Fetch full winner details
            const winnerDetailsResponse = await fetch(`/api/admin/winners/${winnerForDraw.id}`);
            if (winnerDetailsResponse.ok) {
              const winnerDetailsData = await winnerDetailsResponse.json();
              if (winnerDetailsData.success && winnerDetailsData.winner) {
                setEditingWinner({
                  winnerId: winnerDetailsData.winner.id,
                  winnerName: `${winnerDetailsData.winner.winnerFirstName} ${winnerDetailsData.winner.winnerLastName}`.trim(),
                  testimony: winnerDetailsData.winner.testimony,
                  selectedPrize: winnerDetailsData.winner.selectedPrize || winnerDetailsData.winner.selectedPrizeSlug,
                  imageUrl: winnerDetailsData.winner.imageUrl ?? null,
                });
                setSelectedDraw(draw);
                setIsEditWinnerModalOpen(true);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching winner details:", error);
      showToast({
        type: "error",
        title: "Error",
        message: "Failed to load winner details. Please try again.",
        duration: 5000,
      });
    }
  };

  const handleWinnerSelected = async (winnerData: WinnerSelectionData) => {
    if (winnerData.drawType !== "major") {
      return;
    }

    try {
      const requestBody: {
        majorDrawId: string;
        winnerUserId: string;
        imageUrl?: string;
        testimony?: string;
        selectedPrize?: string;
      } = {
        majorDrawId: winnerData.drawId,
        winnerUserId: winnerData.winnerUserId,
      };
      
      if (winnerData.imageUrl) {
        requestBody.imageUrl = winnerData.imageUrl;
      }

      if (winnerData.testimony !== undefined) {
        requestBody.testimony = winnerData.testimony || undefined;
      }

      if (winnerData.selectedPrize !== undefined) {
        requestBody.selectedPrize = winnerData.selectedPrize;
      }

      const response = await fetch("/api/admin/major-draw/select-winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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

  const handleConfirmRemoveWinner = async () => {
    const draw = removeWinnerTarget;
    if (!draw?.winner?.userId) {
      setRemoveWinnerTarget(null);
      return;
    }

    let winnerId = draw.winner.winnerId;
    if (!winnerId) {
      try {
        const res = await fetch(`/api/winners/all?drawType=major&limit=100`);
        const data = await res.json();
        if (data.success && data.winners) {
          const found = data.winners.find(
            (w: { drawId: string; drawType: string }) => w.drawId === draw._id && w.drawType === "major"
          );
          winnerId = found?.id;
        }
      } catch {
        // handled below
      }
    }

    if (!winnerId) {
      showToast({
        type: "error",
        title: "Could not remove winner",
        message: "Winner record ID not found. Refresh the page and try again.",
        duration: 7000,
      });
      setRemoveWinnerTarget(null);
      return;
    }

    setIsRemovingWinner(true);
    try {
      const response = await fetch(`/api/admin/winners/${winnerId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setRemoveWinnerTarget(null);
      await fetchDraws(pagination.currentPage);
      showToast({
        type: "success",
        title: "Winner removed",
        message: "You can select a new winner for this draw when ready.",
        duration: 6000,
      });
    } catch (err) {
      console.error("Error removing winner:", err);
      showToast({
        type: "error",
        title: "Could not remove winner",
        message: err instanceof Error ? err.message : "Please try again.",
        duration: 7000,
      });
    } finally {
      setIsRemovingWinner(false);
    }
  };

  // Handle export
  const handleExport = (draw: DrawResult) => {
    setSelectedDraw(draw);
    setIsExportModalOpen(true);
  };

  // Convert DrawResult to MajorDrawData format for the modal
  const convertToMajorDrawData = (draw: DrawResult) => {
    return {
      _id: draw._id,
      name: draw.name,
      description: draw.description,
      prize: {
        name: draw.prize.name,
        description: draw.prize.description,
        value: draw.prize.value,
        images: [...(draw.prize.images || [])],
        brand: draw.prize.brand || "",
        specifications: undefined, // Specifications field - modal will handle if needed
        terms: draw.prize.terms || [],
      },
      drawDate: draw.drawDate instanceof Date ? draw.drawDate.toISOString() : draw.drawDate,
      activationDate: draw.activationDate instanceof Date ? draw.activationDate.toISOString() : draw.activationDate,
      freezeEntriesAt: draw.freezeEntriesAt instanceof Date ? draw.freezeEntriesAt.toISOString() : draw.freezeEntriesAt,
      status: draw.status,
      configurationLocked: draw.configurationLocked,
    };
  };

  // Handle edit draw
  const handleEditDraw = (draw: DrawResult) => {
    setEditingDraw(draw);
    setIsEditDrawModalOpen(true);
  };

  // Handle save draw - accepts MajorDrawData format from modal
  const handleSaveDraw = async (data: Partial<MajorDrawData>) => {
    if (!editingDraw) return;

    setIsSubmittingDraw(true);
    try {
      const response = await fetch(`/api/admin/major-draw/update?id=${editingDraw._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to update draw" }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Refresh the draws list
      await fetchDraws(pagination.currentPage);
      setIsEditDrawModalOpen(false);
      setEditingDraw(null);

      // Show success toast
      showToast({
        type: "success",
        title: "Draw Updated Successfully!",
        message: `${editingDraw.name} has been updated and changes are now live.`,
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
      setIsSubmittingDraw(false);
    }
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
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
            Draw Results
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-3 sm:p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2 w-1/2"></div>
              <div className="h-8 bg-gray-200 rounded mb-2 w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6 animate-pulse">
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
          icon={Trophy}
          color="blue"
          subtitle="Completed draws"
        />
        <MetricCard
          title="Total Entries"
          value={stats.totalEntries.toLocaleString()}
          icon={Users}
          color="emerald"
          subtitle="All entries combined"
        />
        <MetricCard
          title="Total Prize Value"
          value={formatCurrency(stats.totalPrizeValue)}
          icon={DollarSign}
          color="yellow"
          subtitle="Prize pool value"
        />
        <MetricCard
          title="Winner Rate"
          value={`${stats.winnerSelectionRate}%`}
          icon={CheckCircle}
          color="purple"
          subtitle="Selection completion"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Filter & Search</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Draws List */}
      <div className="space-y-3 sm:space-y-4">
        {draws.map((draw) => {
            const winnerStatus = getWinnerStatus(draw);
            const StatusIcon = winnerStatus.icon;

            return (
              <div key={draw._id} className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
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

                      <div
                        className="text-gray-600 mb-3 [&_p]:my-0"
                        dangerouslySetInnerHTML={{ __html: draw.description || "" }}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>Draw: {formatDate(draw.drawDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <DollarSign className="w-4 h-4" />
                          <span>{draw.prize?.value ? formatCurrency(draw.prize.value) : "N/A"}</span>
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
                          <div className="text-sm text-green-700">
                            <ClickableUserDisplay
                              displayText={
                                draw.winner.userDetails
                                  ? `${draw.winner.userDetails.firstName} ${draw.winner.userDetails.lastName} (${draw.winner.userDetails.email})`
                                  : `User ID: ${draw.winner.userId}`
                              }
                              userId={draw.winner.userId}
                              subtext={`Entry #${draw.winner.entryNumber} • ${formatDate(draw.winner.selectedDate)} • ${draw.winner.selectionMethod === "manual" ? "Manual" : "Government App"}`}
                              className="text-sm text-green-700 hover:text-green-800"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                  <div className="flex flex-wrap gap-2 sm:flex-col sm:flex-shrink-0">
                    {(draw.status === "completed" || draw.status === "frozen") &&
                      (!draw.winner || !draw.winner.userId) && (
                        <Button onClick={() => handleSelectWinner(draw)} size="sm" icon={UserPlus}>
                          Select Winner
                        </Button>
                      )}
                    {draw.winner && draw.winner.userId && (
                      <>
                        <Button onClick={() => handleEditWinner(draw)} size="sm" variant="outline" icon={Edit}>
                          Edit Winner
                        </Button>
                        <Button
                          onClick={() => setRemoveWinnerTarget(draw)}
                          size="sm"
                          variant="outline"
                          icon={UserX}
                          className="border-amber-200 text-amber-800 hover:bg-amber-50"
                        >
                          Remove winner
                        </Button>
                      </>
                    )}
                    <Button onClick={() => handleEditDraw(draw)} size="sm" variant="outline" icon={Edit}>
                      Edit Draw
                    </Button>
                    <Button onClick={() => handleExport(draw)} size="sm" variant="outline" icon={Download}>
                      Export
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={!pagination.hasPrevPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs sm:text-sm text-gray-700 font-medium">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage || isLoading}
                className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.totalPages)}
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
                    imageUrl: selectedDraw.winner.imageUrl,
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

        {/* Winner Edit Modal */}
        {selectedDraw && editingWinner && (
          <WinnerEditModal
            isOpen={isEditWinnerModalOpen}
            onClose={() => {
              setIsEditWinnerModalOpen(false);
              setEditingWinner(null);
              setSelectedDraw(null);
            }}
            winnerId={editingWinner.winnerId}
            winnerName={editingWinner.winnerName}
            drawName={selectedDraw.name}
            drawType="major"
            currentTestimony={editingWinner.testimony}
            currentSelectedPrize={editingWinner.selectedPrize}
            currentImageUrl={editingWinner.imageUrl}
            onUpdate={async () => {
              // Refresh the draws list after update
              await fetchDraws(pagination.currentPage);
            }}
          />
        )}

      <ConfirmationModal
        isOpen={removeWinnerTarget !== null}
        onClose={() => !isRemovingWinner && setRemoveWinnerTarget(null)}
        onConfirm={handleConfirmRemoveWinner}
        type="warning"
        title="Remove major draw winner?"
        message={
          removeWinnerTarget
            ? `This removes the published winner record for “${removeWinnerTarget.name}”. The draw stays completed; use Select Winner to record someone else (e.g. after eligibility checks). This does not delete the user or their entries.`
            : ""
        }
        confirmText="Remove winner"
        cancelText="Cancel"
        isLoading={isRemovingWinner}
      />

      {/* Edit Draw Modal */}
      {editingDraw && (
        <MajorDrawEditModal
          isOpen={isEditDrawModalOpen}
          onCloseAction={() => {
            setIsEditDrawModalOpen(false);
            setEditingDraw(null);
          }}
          onSaveAction={handleSaveDraw}
          majorDraw={convertToMajorDrawData(editingDraw)}
          isLoading={isSubmittingDraw}
        />
      )}
    </div>
  );
}
