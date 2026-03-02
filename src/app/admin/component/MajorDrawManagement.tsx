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
  Award,
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (error || !currentMajorDraw) {
    return (
      <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 rounded-xl">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <p className="font-bold">Error Loading Major Draw</p>
        </div>
        <p className="text-sm mt-1">Failed to load major draw data. Please try again.</p>
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
    <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100 ">
      <div className="w-full mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">Major Draw Management</h1>
          <p className="text-lg text-gray-600 font-['Poppins']">Monitor and manage the current major draw</p>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`px-6 py-4 rounded-2xl border-2 flex items-center gap-3 shadow-lg ${
              message.type === "success"
                ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800"
                : "bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-6 h-6 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-current hover:opacity-70 transition-opacity p-1 rounded-full hover:bg-white/50"
            >
              ×
            </button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Main Draw Card */}
          <div className="bg-gradient-to-br from-red-600 via-red-700 to-red-800 rounded-2xl shadow-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <Trophy className="w-10 h-10 text-yellow-300" />
                {getStatusBadge()}
              </div>
              <h3 className="text-2xl font-bold mb-2 font-['Poppins']">{majorDraw.name}</h3>
              <div
                className="text-red-100 text-sm [&_p]:my-0 [&_p]:text-red-100"
                dangerouslySetInnerHTML={{ __html: majorDraw.description || "Monthly Major Draw" }}
              />
            </div>
          </div>

          {/* Participants Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
                <Users className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Participants</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1 font-['Poppins']">
              {majorDraw.totalParticipants || 0}
            </h3>
            <p className="text-sm text-gray-600 mb-4">{majorDraw.totalEntries || 0} total entries</p>
            <button
              onClick={() => setIsParticipantsModalOpen(true)}
              className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              View Participants
            </button>
          </div>

          {/* Draw Date Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Draw Date</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1 font-['Poppins']">
              {majorDraw.drawDate ? formatDateInAEST(new Date(majorDraw.drawDate), "MMM dd, yyyy") : "Not set"}
            </h3>
            <p className="text-sm text-gray-600">
              {majorDraw.drawDate ? formatDateInAEST(new Date(majorDraw.drawDate), "h:mm a") : "Time TBD"}
            </p>
          </div>

          {/* Countdown Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">Time Until Draw</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1 font-['Poppins']">
              {timeUntilDraw > 0 ? formatCountdown(timeUntilDraw) : "Completed"}
            </h3>
            <p className="text-sm text-gray-600">{isFrozen ? "Entries frozen" : "Entries active"}</p>
          </div>
        </div>

        {/* Prize Information */}
        {activePrize && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl">
                <Award className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 font-['Poppins']">Prize Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-600 mb-2">Prize Name</p>
                <p className="text-lg font-bold text-gray-900 font-['Poppins']">{activePrize.label}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-600 mb-2">Value</p>
                <p className="text-xl font-bold text-green-700 font-['Poppins']">
                  {activePrize.prizeValueLabel ?? "See Prize Options"}
                </p>
              </div>
              {activePrize.detailedDescription && (
                <div className="md:col-span-2 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-600 mb-2">Description</p>
                  <p className="text-gray-700 leading-relaxed">{activePrize.detailedDescription}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Export Actions */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl">
              <Download className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 font-['Poppins']">Export Participants</h3>
          </div>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Export all participants and their entry counts for the current draw in your preferred format.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => handleExport("csv")}
              disabled={isExporting || !canExport}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-medium"
            >
              <FileSpreadsheet className="w-5 h-5" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
            <button
              onClick={() => handleExport("excel")}
              disabled={isExporting || !canExport}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-medium"
            >
              <FileSpreadsheet className="w-5 h-5" />
              {isExporting ? "Exporting..." : "Export Excel"}
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-3 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-medium"
            >
              <RefreshCw className="w-5 h-5" />
              Refresh Data
            </button>
          </div>
        </div>

        {/* Winner Selection */}
        {canSelectWinner && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl">
                <Award className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 font-['Poppins']">Record Winner</h3>
            </div>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Select the winner using our enhanced user search and selection system.
            </p>
            <button
              onClick={() => setIsWinnerModalOpen(true)}
              disabled={isSubmitting}
              className="w-full px-6 py-4 bg-gradient-to-r from-yellow-600 to-yellow-700 text-white rounded-xl hover:from-yellow-700 hover:to-yellow-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold flex items-center justify-center gap-3 text-lg"
            >
              <UserPlus className="w-6 h-6" />
              {isSubmitting ? "Processing..." : "Select Winner"}
            </button>
          </div>
        )}

        {/* Winner Display */}
        {currentWinner && (
          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl shadow-lg border-2 border-yellow-400 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                Winner Selected
              </h3>
              {currentWinner.winnerId && (
                <button
                  onClick={() => setIsEditWinnerModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-red-700 text-white rounded-lg hover:from-red-700 hover:to-[#ee0000] transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Edit Winner
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Winner User ID</p>
                <p className="font-semibold text-gray-900">{currentWinner.userId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Entry Number</p>
                <p className="font-semibold text-gray-900">{currentWinner.entryNumber || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Selection Method</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {currentWinner.selectionMethod || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Selected At</p>
                <p className="font-semibold text-gray-900">
                  {currentWinner.selectedDate
                    ? formatDateInAEST(currentWinner.selectedDate, "MMM dd, yyyy h:mm a")
                    : "N/A"}
                </p>
              </div>
            </div>
            {/* Display selected prize if available */}
            {currentWinner.selectedPrize && (
              <div className="mt-4 p-3 bg-white rounded-lg border border-yellow-300">
                <p className="text-sm text-gray-600 mb-1">Selected Prize</p>
                <p className="font-semibold text-gray-900">{currentWinner.selectedPrize}</p>
              </div>
            )}
            {/* Display testimony preview if available */}
            {currentWinner.testimony && (
              <div className="mt-4 p-3 bg-white rounded-lg border border-yellow-300">
                <p className="text-sm text-gray-600 mb-1">Testimony Preview</p>
                <p className="text-sm text-gray-700 line-clamp-3">{currentWinner.testimony}</p>
              </div>
            )}
          </div>
        )}

        {/* Configuration Lock Warning */}
        {majorDraw.configurationLocked && (
          <div className="bg-blue-50 border-2 border-blue-400 text-blue-700 px-4 py-3 rounded-xl flex items-center gap-2">
            <Lock className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Configuration Locked</p>
              <p className="text-sm">
                This draw&apos;s configuration is locked and cannot be modified until after the draw is completed.
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gray-50 rounded-xl border-2 border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-2">Admin Instructions</h3>
          <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
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
              // Refetch winner data after update
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
    </div>
  );
}
