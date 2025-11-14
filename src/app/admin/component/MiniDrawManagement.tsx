"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Trophy,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Pencil,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import AdminMiniDrawModal from "@/components/modals/AdminMiniDrawModal";
import WinnerSelectionModal, { type WinnerSelectionData } from "@/components/modals/WinnerSelectionModal";
import MiniDrawEditModal, {
  type AdminMiniDrawSummary,
  type MiniDrawEditPayload,
} from "@/components/modals/MiniDrawEditModal";
import Image from "next/image";

interface MiniDraw extends AdminMiniDrawSummary {
  totalEntries: number;
  entriesRemaining: number;
  cycle: number;
  configurationLocked?: boolean;
  prize: AdminMiniDrawSummary["prize"] & {
    value: number;
    description: string;
    category: string;
  };
  latestWinner?: {
    _id: string;
    userId: string;
    entryNumber: number;
    selectedDate: string;
    imageUrl?: string;
    cycle: number;
  };
}

export default function MiniDrawManagement() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [miniDraws, setMiniDraws] = useState<MiniDraw[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSelectingWinner, setIsSelectingWinner] = useState(false);
  const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDraw, setSelectedDraw] = useState<MiniDraw | null>(null);
  const [editingDraw, setEditingDraw] = useState<MiniDraw | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Fetch mini draws
  const fetchMiniDraws = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/mini-draw/list");
      if (response.ok) {
        const data = await response.json();
        setMiniDraws(data.data.miniDraws || []);
      } else {
        showToast({
          type: "error",
          title: "Failed to load mini draws",
        });
      }
    } catch (error) {
      console.error("Error fetching mini draws:", error);
      showToast({
        type: "error",
        title: "Failed to load mini draws",
      });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchMiniDraws();
  }, [fetchMiniDraws]);

  const openEditModal = (draw: MiniDraw) => {
    // Store a snapshot of the draw so the modal can pre-fill every field.
    setEditingDraw(draw);
    setIsEditModalOpen(true);
  };

  const handleEditSave = async (payload: MiniDrawEditPayload) => {
    setIsSavingEdit(true);
    try {
      const response = await fetch("/api/admin/mini-draw/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data?.error || "Failed to update mini draw";
        throw new Error(message);
      }

      showToast({
        type: "success",
        title: "Mini draw updated",
        message: "Your changes have been saved.",
      });
      await fetchMiniDraws();
      setIsEditModalOpen(false);
      setEditingDraw(null);
    } catch (error) {
      console.error("Mini draw update failed:", error);
      showToast({
        type: "error",
        title: "Update failed",
        message: error instanceof Error ? error.message : "Unable to save changes right now.",
      });
      throw error;
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter mini draws by status
  const filteredMiniDraws =
    selectedStatus === "all" ? miniDraws : miniDraws.filter((draw) => draw.status === selectedStatus);

  // Handle export
  const handleExport = async (miniDrawId: string, drawName: string, format: "csv" | "excel") => {
    try {
      setIsExporting(true);
      const response = await fetch(`/api/admin/mini-draw/${miniDrawId}/export?format=${format}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = drawName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
        a.download = `mini-draw-export-${safeName}-${new Date().toISOString().split("T")[0]}.${
          format === "excel" ? "xlsx" : "csv"
        }`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast({
          type: "success",
          title: "Export successful",
          message: `Downloaded ${drawName} as ${format.toUpperCase()}`,
        });
      } else {
        showToast({
          type: "error",
          title: "Export failed",
        });
      }
    } catch (error) {
      console.error("Error exporting:", error);
      showToast({
        type: "error",
        title: "Export failed",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: { bg: "bg-green-100 text-green-800", icon: CheckCircle },
      completed: { bg: "bg-gray-100 text-gray-800", icon: Trophy },
      cancelled: { bg: "bg-red-100 text-red-800", icon: XCircle },
    };
    const badge = badges[status as keyof typeof badges] || badges.active;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="w-full mx-auto space-y-8 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">Mini Draw Management</h1>
            <p className="text-lg text-gray-600 font-['Poppins']">Create and manage mini draws</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Create Mini Draw
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {["all", "queued", "active", "frozen", "completed", "cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedStatus === status
                  ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Mini Draws List */}
        <div className="grid gap-4">
          {filteredMiniDraws.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
              <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No mini draws found</p>
            </div>
          ) : (
            filteredMiniDraws.map((draw) => (
              <div key={draw._id} className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{draw.name}</h3>
                      {getStatusBadge(draw.status)}
                    </div>
                    <p className="text-gray-600 mb-4">{draw.description}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-gray-600">{draw.prize.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-gray-600">{draw.totalEntries} entries</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-gray-600">
                          {draw.entriesRemaining.toLocaleString()} remaining
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-gray-600">Cycle #{draw.cycle}</span>
                      </div>
                    </div>
                    {draw.latestWinner && (
                      <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Latest Winner</p>
                            <p className="text-xs text-gray-600">
                              Selected {new Date(draw.latestWinner.selectedDate).toLocaleString()}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-gray-500">
                            Entry #{draw.latestWinner.entryNumber}
                          </span>
                        </div>
                        {draw.latestWinner.imageUrl && (
                          <div className="mt-3">
                            <Image
                              src={draw.latestWinner.imageUrl}
                              alt="Winner"
                              width={80}
                              height={80}
                              className="w-20 h-20 rounded-lg object-cover border"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openEditModal(draw)}
                      className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-all hover:bg-gray-200"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDraw(draw);
                        setIsWinnerModalOpen(true);
                      }}
                      disabled={draw.totalEntries === 0 || isSelectingWinner}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 shadow-md ${
                        draw.totalEntries === 0 || isSelectingWinner
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800"
                      }`}
                    >
                      <Trophy className="w-4 h-4" />
                      Select Winner
                    </button>
                    <button
                      onClick={() => handleExport(draw._id, draw.name, "csv")}
                      disabled={isExporting}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      {isExporting ? "Exporting..." : "Export CSV"}
                    </button>
                    <button
                      onClick={() => handleExport(draw._id, draw.name, "excel")}
                      disabled={isExporting}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      {isExporting ? "Exporting..." : "Export Excel"}
                    </button>
                    <button
                      onClick={() => fetchMiniDraws()}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Modal */}
      <AdminMiniDrawModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchMiniDraws();
          setIsModalOpen(false);
          showToast({
            type: "success",
            title: "Mini draw created successfully",
          });
        }}
      />

      <WinnerSelectionModal
        isOpen={isWinnerModalOpen}
        onClose={() => {
          setIsWinnerModalOpen(false);
          setSelectedDraw(null);
        }}
        onWinnerSelected={async (winnerData: WinnerSelectionData) => {
          if (!session?.user?.id) {
            showToast({
              type: "error",
              title: "Session expired",
              message: "Please sign in again to record winners.",
            });
            return;
          }

          setIsSelectingWinner(true);
          try {
            const formData = new FormData();
            formData.append("miniDrawId", winnerData.drawId);
            formData.append("winnerUserId", winnerData.winnerUserId);
            formData.append("entryNumber", winnerData.entryNumber.toString());
            formData.append("selectionMethod", winnerData.selectionMethod);
            formData.append("selectedBy", session.user.id);

            if (winnerData.imageFile) {
              formData.append("winnerImage", winnerData.imageFile);
            } else if (winnerData.imageUrl) {
              formData.append("imageUrl", winnerData.imageUrl);
            }

            const response = await fetch(`/api/admin/mini-draw/${winnerData.drawId}/select-winner`, {
              method: "POST",
              body: formData,
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || "Failed to record winner");
            }

            showToast({
              type: "success",
              title: "Winner recorded",
              message: "Winner saved and mini draw reopened for the next cycle.",
            });

            setIsWinnerModalOpen(false);
            setSelectedDraw(null);
            fetchMiniDraws();
          } catch (error) {
            console.error("Winner selection error:", error);
            showToast({
              type: "error",
              title: "Failed to record winner",
              message: error instanceof Error ? error.message : "Unexpected error occurred.",
            });
          } finally {
            setIsSelectingWinner(false);
          }
        }}
        drawId={selectedDraw?._id || ""}
        drawName={selectedDraw?.name || ""}
        totalEntries={selectedDraw?.totalEntries || 0}
        drawType="mini"
        currentWinner={
          selectedDraw?.latestWinner
            ? {
                userId: selectedDraw.latestWinner.userId,
                entryNumber: selectedDraw.latestWinner.entryNumber,
                selectionMethod: "manual",
                imageUrl: selectedDraw.latestWinner.imageUrl,
              }
            : undefined
        }
        enableImageField
      />

      <MiniDrawEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingDraw(null);
        }}
        miniDraw={
          editingDraw
            ? {
                _id: editingDraw._id,
                name: editingDraw.name,
                description: editingDraw.description,
                minimumEntries: editingDraw.minimumEntries,
                status: editingDraw.status,
                configurationLocked: editingDraw.configurationLocked,
                prize: {
                  name: editingDraw.prize.name,
                  description: editingDraw.prize.description,
                  value: editingDraw.prize.value,
                  images: editingDraw.prize.images,
                  category: editingDraw.prize.category,
                },
              }
            : null
        }
        onSave={handleEditSave}
        isSaving={isSavingEdit}
      />
    </div>
  );
}
