"use client";

import React, { useState, useEffect } from "react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { formatDateInAEST, formatCountdown } from "@/utils/common/timezone";
import { useToast } from "@/components/ui/Toast";
import WinnerSelectionModal, { type WinnerSelectionData } from "@/components/modals/WinnerSelectionModal";
import WinnerEditModal from "@/components/modals/WinnerEditModal";
import ParticipantsModal from "@/components/modals/ParticipantsModal";
import {
  Trophy,
  Users,
  Calendar,
  Clock,
  Download,
  FileSpreadsheet,
  Lock,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";

export default function MajorDrawManagement() {
  const { showToast } = useToast();
  const { data: currentMajorDraw, isLoading, error, refetch } = useCurrentMajorDraw();
  const { activePrize } = usePrizeCatalog();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<{
    userId: string;
    entryNumber: number;
    selectedDate: Date;
    selectionMethod?: string;
    imageUrl?: string;
    testimony?: string | null;
    selectedPrize?: string | null;
    winnerId?: string;
    winnerName?: string;
  } | null>(null);
  const [_isLoadingWinner, setIsLoadingWinner] = useState(false);
  const [isEditWinnerModalOpen, setIsEditWinnerModalOpen] = useState(false);

  // Fetch current winner from Winner model
  useEffect(() => {
    if (!currentMajorDraw?._id) return;
    
    const fetchWinner = async () => {
      setIsLoadingWinner(true);
      try {
        // First, get basic winner info
        const response = await fetch(`/api/admin/major-draw/select-winner?majorDrawId=${currentMajorDraw._id}`);
        const data = await response.json();
        
        if (data.hasWinner && data.winner) {
          // Now fetch full winner details using the winners API
          // We need to find the winner document by drawId and drawType
          // Since we don't have the winner document ID yet, let's query all winners for this draw
          try {
            const allWinnersResponse = await fetch(`/api/winners/all?drawType=major&limit=100`);
            if (allWinnersResponse.ok) {
              const allWinnersData = await allWinnersResponse.json();
              if (allWinnersData.success && allWinnersData.winners) {
                // Find the winner for this specific draw
                const winnerForDraw = allWinnersData.winners.find(
                  (w: { drawId: string; drawType: string }) =>
                    w.drawId === currentMajorDraw._id?.toString() && w.drawType === "major"
                );
                
                if (winnerForDraw) {
                  // Now fetch full details using the winner ID
                  const winnerDetailsResponse = await fetch(`/api/admin/winners/${winnerForDraw.id}`);
                  if (winnerDetailsResponse.ok) {
                    const winnerDetailsData = await winnerDetailsResponse.json();
                    if (winnerDetailsData.success && winnerDetailsData.winner) {
                      setCurrentWinner({
                        userId: data.winner.userId.toString(),
                        entryNumber: data.winner.entryNumber || 0,
                        selectedDate: new Date(data.winner.selectedDate),
                        selectionMethod: data.winner.selectionMethod,
                        imageUrl: data.winner.imageUrl,
                        testimony: winnerDetailsData.winner.testimony,
                        selectedPrize: winnerDetailsData.winner.selectedPrize || winnerDetailsData.winner.selectedPrizeSlug,
                        winnerId: winnerDetailsData.winner.id,
                        winnerName: `${winnerDetailsData.winner.winnerFirstName} ${winnerDetailsData.winner.winnerLastName}`.trim(),
                      });
                    } else {
                      // Fallback
                      setCurrentWinner({
                        userId: data.winner.userId.toString(),
                        entryNumber: data.winner.entryNumber || 0,
                        selectedDate: new Date(data.winner.selectedDate),
                        selectionMethod: data.winner.selectionMethod,
                        imageUrl: data.winner.imageUrl,
                        testimony: winnerForDraw.testimony,
                        selectedPrize: winnerForDraw.selectedPrize || winnerForDraw.selectedPrizeSlug,
                        winnerId: winnerForDraw.id,
                      });
                    }
                  } else {
                    // Fallback
                    setCurrentWinner({
                      userId: data.winner.userId.toString(),
                      entryNumber: data.winner.entryNumber || 0,
                      selectedDate: new Date(data.winner.selectedDate),
                      selectionMethod: data.winner.selectionMethod,
                      imageUrl: data.winner.imageUrl,
                      testimony: winnerForDraw.testimony,
                      selectedPrize: winnerForDraw.selectedPrize || winnerForDraw.selectedPrizeSlug,
                      winnerId: winnerForDraw.id,
                    });
                  }
                } else {
                  // No winner found in all winners, use basic data
                  setCurrentWinner({
                    userId: data.winner.userId.toString(),
                    entryNumber: data.winner.entryNumber || 0,
                    selectedDate: new Date(data.winner.selectedDate),
                    selectionMethod: data.winner.selectionMethod,
                    imageUrl: data.winner.imageUrl,
                    testimony: data.winner.testimony,
                    selectedPrize: data.winner.selectedPrize || data.winner.selectedPrizeSlug,
                  });
                }
              } else {
                // Fallback to basic winner data
                setCurrentWinner({
                  userId: data.winner.userId.toString(),
                  entryNumber: data.winner.entryNumber || 0,
                  selectedDate: new Date(data.winner.selectedDate),
                  selectionMethod: data.winner.selectionMethod,
                  imageUrl: data.winner.imageUrl,
                  testimony: data.winner.testimony,
                    selectedPrize: data.winner.selectedPrize || data.winner.selectedPrizeSlug,
                });
              }
            } else {
              // Fallback to basic winner data
              setCurrentWinner({
                userId: data.winner.userId.toString(),
                entryNumber: data.winner.entryNumber || 0,
                selectedDate: new Date(data.winner.selectedDate),
                selectionMethod: data.winner.selectionMethod,
                imageUrl: data.winner.imageUrl,
                testimony: data.winner.testimony,
                    selectedPrize: data.winner.selectedPrize || data.winner.selectedPrizeSlug,
              });
            }
          } catch (detailError) {
            console.error("Error fetching winner details:", detailError);
            // Fallback to basic winner data
            setCurrentWinner({
              userId: data.winner.userId.toString(),
              entryNumber: data.winner.entryNumber || 0,
              selectedDate: new Date(data.winner.selectedDate),
              selectionMethod: data.winner.selectionMethod,
              imageUrl: data.winner.imageUrl,
              testimony: data.winner.testimony,
                    selectedPrize: data.winner.selectedPrize || data.winner.selectedPrizeSlug,
            });
          }
        } else {
          setCurrentWinner(null);
        }
      } catch (error) {
        console.error("Error fetching winner:", error);
        setCurrentWinner(null);
      } finally {
        setIsLoadingWinner(false);
      }
    };

    fetchWinner();
  }, [currentMajorDraw?._id, refetch]);

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
            Major Draw
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
      </div>
    );
  }

  if (error || !currentMajorDraw) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900">Major Draw</h2>
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-bold">Error Loading Major Draw</p>
            <p className="text-sm mt-1">Failed to load major draw data. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const majorDraw = currentMajorDraw;

  // Check if draw is frozen or completed
  const isFrozen = majorDraw.status === "frozen" || majorDraw.status === "completed";
  const canExport = majorDraw.status !== "cancelled";
  const canSelectWinner = (majorDraw.status === "frozen" || majorDraw.status === "completed") && !currentWinner;

  // Calculate time until draw
  const timeUntilDraw = majorDraw.drawDate
    ? Math.max(0, new Date(majorDraw.drawDate).getTime() - new Date().getTime())
    : 0;

  // Get status badge
  const getStatusBadge = () => {
    switch (majorDraw.status) {
      case "active":
        return (
          <div className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1.5 rounded-lg">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Active</span>
          </div>
        );
      case "frozen":
        return (
          <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg">
            <Lock className="w-4 h-4" />
            <span className="text-sm font-semibold">Frozen</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-2 bg-gray-100 text-gray-800 px-3 py-1.5 rounded-lg">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Completed</span>
          </div>
        );
      case "queued":
        return (
          <div className="flex items-center gap-2 bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-lg">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-semibold">Queued</span>
          </div>
        );
      case "cancelled":
        return (
          <div className="flex items-center gap-2 bg-red-100 text-red-800 px-3 py-1.5 rounded-lg">
            <XCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Cancelled</span>
          </div>
        );
    }
  };

  /**
   * Handle CSV/Excel export
   */
  const handleExport = async (format: "csv" | "excel") => {
    if (!canExport) {
      showToast({
        type: "error",
        title: "Export Not Available",
        message: "Cannot export cancelled draws",
        duration: 5000,
      });
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/major-draw/export?format=${format}&majorDrawId=${majorDraw._id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `major-draw-export-${majorDraw.name}-${new Date().toISOString().split("T")[0]}.${
        format === "excel" ? "xlsx" : "csv"
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast({
        type: "success",
        title: "Export Successful!",
        message: `Successfully exported ${majorDraw.name} to ${format.toUpperCase()} format`,
        duration: 5000,
      });
    } catch (error) {
      console.error("Export error:", error);

      const errorMessage = error instanceof Error ? error.message : "Failed to export data. Please try again.";
      showToast({
        type: "error",
        title: "Export Failed",
        message: errorMessage,
        duration: 7000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Handle winner selection from modal
   */
  const handleWinnerSelected = async (winnerData: WinnerSelectionData) => {
    if (winnerData.drawType !== "major") {
      return;
    }

    setIsSubmitting(true);
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
      
      // Explicitly include imageUrl if it exists (check for truthy string)
      if (winnerData.imageUrl && typeof winnerData.imageUrl === 'string' && winnerData.imageUrl.trim() !== '') {
        requestBody.imageUrl = winnerData.imageUrl.trim();
      } else {
        console.warn("⚠️ [MajorDrawManagement] No imageUrl in winnerData:", {
          hasImageUrl: !!winnerData.imageUrl,
          imageUrlType: typeof winnerData.imageUrl,
          imageUrlValue: winnerData.imageUrl,
          winnerDataKeys: Object.keys(winnerData),
        });
      }

      // Include testimony and selectedPrizeSlug if provided
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to select winner");
      }

      showToast({
        type: "success",
        title: "Winner Recorded Successfully!",
        message: `Winner has been recorded for ${majorDraw.name}`,
        duration: 5000,
      });

      setIsWinnerModalOpen(false);
      // Refetch winner from Winner model - trigger the useEffect to reload
      refetch();
    } catch (error) {
      console.error("Winner selection error:", error);

      const errorMessage = error instanceof Error ? error.message : "Failed to record winner. Please try again.";
      showToast({
        type: "error",
        title: "Failed to Record Winner",
        message: errorMessage,
        duration: 7000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
   
      {/* Message Display */}
      {message && (
        <div
          className={`px-4 sm:px-6 py-3 sm:py-4 rounded-xl border-2 flex items-center gap-3 ${
            message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium flex-1">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-current hover:opacity-70 transition-opacity p-1 rounded-full hover:bg-white/50"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Draw Card */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-6 h-6 text-red-600" />
              {getStatusBadge()}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">{majorDraw.name}</h3>
            <div
              className="text-gray-600 text-sm [&_p]:my-0 line-clamp-2"
              dangerouslySetInnerHTML={{ __html: majorDraw.description || "Monthly Major Draw" }}
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Participants Card */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-semibold text-gray-600">Participants</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{majorDraw.totalParticipants || 0}</p>
          <p className="text-xs text-gray-500 mb-3">{majorDraw.totalEntries || 0} total entries</p>
          <button
            onClick={() => setIsParticipantsModalOpen(true)}
            className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Users className="w-4 h-4" />
            View Participants
          </button>
        </div>

        {/* Draw Date Card */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-semibold text-gray-600">Draw Date</span>
            <Calendar className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base sm:text-lg font-bold text-gray-900">
            {majorDraw.drawDate ? formatDateInAEST(new Date(majorDraw.drawDate), "MMM dd, yyyy") : "Not set"}
          </p>
          <p className="text-xs text-gray-500">
            {majorDraw.drawDate ? formatDateInAEST(new Date(majorDraw.drawDate), "h:mm a") : "Time TBD"}
          </p>
        </div>

        {/* Countdown Card */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-semibold text-gray-600">Time Until Draw</span>
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-base sm:text-lg font-bold text-gray-900">
            {timeUntilDraw > 0 ? formatCountdown(timeUntilDraw) : "Completed"}
          </p>
          <p className="text-xs text-gray-500">{isFrozen ? "Entries frozen" : "Entries active"}</p>
        </div>
      </div>

      {/* Prize Information */}
      {activePrize && (
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Prize Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-100">
              <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Prize Name</p>
              <p className="text-base sm:text-lg font-bold text-gray-900">{activePrize.label}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 sm:p-4 border border-emerald-100">
              <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Value</p>
              <p className="text-base sm:text-lg font-bold text-emerald-700">
                {activePrize.prizeValueLabel ?? "See Prize Options"}
              </p>
            </div>
            {activePrize.detailedDescription && (
              <div className="sm:col-span-2 bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-100">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{activePrize.detailedDescription}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Actions */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Export Participants</h3>
        <p className="text-sm text-gray-600 mb-4">
          Export all participants and their entry counts for the current draw in your preferred format.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport("csv")}
            disabled={isExporting || !canExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={isExporting || !canExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Winner Selection */}
      {canSelectWinner && (
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Record Winner</h3>
          <p className="text-sm text-gray-600 mb-4">
            Select the winner using our enhanced user search and selection system.
          </p>
          <button
            onClick={() => setIsWinnerModalOpen(true)}
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold flex items-center justify-center gap-2"
          >
            <UserPlus className="w-5 h-5" />
            {isSubmitting ? "Processing..." : "Select Winner"}
          </button>
        </div>
      )}

      {/* Winner Display */}
      {currentWinner && (
        <div className="bg-amber-50 rounded-xl shadow-lg border-2 border-amber-200 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-600" />
                Winner Selected
              </h3>
              {currentWinner.winnerId && (
                <button
                  onClick={() => setIsEditWinnerModalOpen(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 w-full sm:w-auto transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Edit Winner
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Winner User ID</p>
                <p className="font-semibold text-gray-900 text-sm sm:text-base">{currentWinner.userId}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Entry Number</p>
                <p className="font-semibold text-gray-900 text-sm sm:text-base">{currentWinner.entryNumber || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Selection Method</p>
                <p className="font-semibold text-gray-900 text-sm sm:text-base capitalize">
                  {currentWinner.selectionMethod || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Selected At</p>
                <p className="font-semibold text-gray-900 text-sm sm:text-base">
                  {currentWinner.selectedDate
                    ? formatDateInAEST(currentWinner.selectedDate, "MMM dd, yyyy h:mm a")
                    : "N/A"}
                </p>
              </div>
            </div>
          {currentWinner.selectedPrize && (
            <div className="mt-4 p-3 bg-white rounded-lg border border-amber-200">
              <p className="text-xs sm:text-sm text-gray-600 mb-1">Selected Prize</p>
              <p className="font-semibold text-gray-900">{currentWinner.selectedPrize}</p>
            </div>
          )}
          {currentWinner.testimony && (
            <div className="mt-4 p-3 bg-white rounded-lg border border-amber-200">
              <p className="text-xs sm:text-sm text-gray-600 mb-1">Testimony Preview</p>
              <p className="text-sm text-gray-700 line-clamp-3">{currentWinner.testimony}</p>
            </div>
          )}
        </div>
      )}

      {/* Configuration Lock Warning */}
      {majorDraw.configurationLocked && (
        <div className="bg-blue-50 border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <Lock className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm sm:text-base">Configuration Locked</p>
            <p className="text-xs sm:text-sm">
              This draw&apos;s configuration is locked and cannot be modified until after the draw is completed.
            </p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-2">Admin Instructions</h3>
        <ul className="text-xs sm:text-sm text-gray-700 space-y-1 list-disc list-inside">
            <li>Export buttons are available anytime to download participant data</li>
            <li>Entries freeze automatically 30 minutes before the draw date</li>
            <li>Winner selection is only available after the draw has been frozen or completed</li>
            <li>Use the enhanced user search to find and select winners easily</li>
            <li>Configuration becomes locked when entries are frozen</li>
          </ul>
        </div>

      {/* Winner Selection Modal */}
      <WinnerSelectionModal
        isOpen={isWinnerModalOpen}
        onClose={() => setIsWinnerModalOpen(false)}
        onWinnerSelected={handleWinnerSelected}
        drawId={majorDraw._id || ""}
        drawName={majorDraw.name || ""}
        drawType="major"
        totalEntries={majorDraw.totalEntries}
        enableImageField={true}
        currentWinner={
          currentWinner
            ? {
                userId: currentWinner.userId,
                imageUrl: currentWinner.imageUrl,
              }
            : undefined
        }
      />

      {/* Winner Edit Modal */}
      {currentWinner && currentWinner.winnerId && (
        <WinnerEditModal
          isOpen={isEditWinnerModalOpen}
          onClose={() => setIsEditWinnerModalOpen(false)}
          winnerId={currentWinner.winnerId}
          winnerName={currentWinner.winnerName || "Winner"}
          drawName={majorDraw.name || ""}
          drawType="major"
          currentTestimony={currentWinner.testimony}
          currentSelectedPrize={currentWinner.selectedPrize}
          currentImageUrl={currentWinner.imageUrl}
          onUpdate={async () => {
            refetch();
          }}
        />
      )}

      {/* Participants Modal */}
      <ParticipantsModal
        isOpen={isParticipantsModalOpen}
        onClose={() => setIsParticipantsModalOpen(false)}
        majorDrawId={majorDraw._id || ""}
        majorDrawName={majorDraw.name || ""}
      />
    </div>
  );
}
