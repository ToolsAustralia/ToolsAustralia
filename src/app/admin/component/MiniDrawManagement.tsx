"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Trophy,
  CheckCircle,
  XCircle,
  FileText,
  Trash2,
  Loader2,
  Move,
  MessageSquare,
} from "lucide-react";
import { AdminBadge } from "@/components/admin/ui/AdminBadge";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import AdminMiniDrawModal from "@/components/modals/AdminMiniDrawModal";
import WinnerSelectionModal, { type WinnerSelectionData } from "@/components/modals/WinnerSelectionModal";
import WinnerEditModal from "@/components/modals/WinnerEditModal";
import MiniDrawEditModal, {
  type AdminMiniDrawSummary,
  type MiniDrawEditPayload,
} from "@/components/modals/MiniDrawEditModal";
import Image from "next/image";
import { getBrandMeta, defaultBrandLogo } from "@/utils/brand-utils";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import ConfirmationModal from "@/components/modals/ConfirmationModal";

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
    drawResultUrl?: string;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isOrderDirty, setIsOrderDirty] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MiniDraw | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [miniWinnerEditOpen, setMiniWinnerEditOpen] = useState(false);
  const [miniWinnerEdit, setMiniWinnerEdit] = useState<{
    winnerId: string;
    winnerName: string;
    drawName: string;
    testimony: string | null;
    imageUrl: string | null;
    drawResultUrl: string | null;
  } | null>(null);
  // Configure sensors for both mouse and touch input to support mobile devices
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  // Fetch mini draws
  const fetchMiniDraws = useCallback(async () => {
    try {
      setIsLoading(true);
      // Request all mini-draws by setting a high limit
      const response = await fetch("/api/admin/mini-draw/list?limit=1000");
      if (response.ok) {
        const data = await response.json();
        setMiniDraws(data.data.miniDraws || []);
        window.dispatchEvent(new Event("admin-mini-draws-updated"));
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!isReorderMode) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setMiniDraws((prev) => {
        const oldIndex = prev.findIndex((draw) => draw._id === active.id);
        const newIndex = prev.findIndex((draw) => draw._id === over.id);
        if (oldIndex === -1 || newIndex === -1) {
          return prev;
        }
        return arrayMove(prev, oldIndex, newIndex);
      });
      setIsOrderDirty(true);
    },
    [isReorderMode]
  );

  const handleSaveOrder = useCallback(async () => {
    if (!isOrderDirty || isSavingOrder) {
      return;
    }
    try {
      setIsSavingOrder(true);
      const orderedIds = miniDraws.map((draw) => draw._id);
      const response = await fetch("/api/admin/mini-draw/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderedIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save order");
      }
      showToast({
        type: "success",
        title: "Mini draw order saved",
        message: "Updated ordering will be reflected on the site shortly.",
      });
      setIsOrderDirty(false);
      setIsReorderMode(false);
      await fetchMiniDraws();
      window.dispatchEvent(new Event("admin-mini-draws-updated"));
    } catch (error) {
      console.error("Failed to save order", error);
      showToast({
        type: "error",
        title: "Unable to save order",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSavingOrder(false);
    }
  }, [fetchMiniDraws, isOrderDirty, miniDraws, showToast, isSavingOrder]);

  const handleCancelReorder = useCallback(async () => {
    setIsReorderMode(false);
    setIsOrderDirty(false);
    await fetchMiniDraws();
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
      window.dispatchEvent(new Event("admin-mini-draws-updated"));
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

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeletingId(deleteTarget._id);
    try {
      const response = await fetch(`/api/admin/mini-draw/${deleteTarget._id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete mini draw");
      }

      showToast({
        type: "success",
        title: "Mini draw deleted",
        message: `"${deleteTarget.name}" has been removed.`,
      });
      await fetchMiniDraws();
      window.dispatchEvent(new Event("admin-mini-draws-updated"));
    } catch (error) {
      console.error("Mini draw delete failed:", error);
      showToast({
        type: "error",
        title: "Delete failed",
        message: error instanceof Error ? error.message : "Unable to delete mini draw.",
      });
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
      setIsDeleteModalOpen(false);
    }
  }, [deleteTarget, fetchMiniDraws, showToast]);

  const openDeleteModal = (draw: MiniDraw) => {
    setDeleteTarget(draw);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  const openMiniWinnerEdit = async (draw: MiniDraw) => {
    const wid = draw.latestWinner?._id;
    if (!wid) return;
    try {
      const res = await fetch(`/api/admin/winners/${wid}`);
      const data = await res.json();
      if (!res.ok || !data.success || !data.winner) {
        throw new Error(data.error || "Failed to load winner");
      }
      setMiniWinnerEdit({
        winnerId: data.winner.id,
        winnerName: `${data.winner.winnerFirstName} ${data.winner.winnerLastName}`.trim(),
        drawName: draw.name,
        testimony: data.winner.testimony ?? null,
        imageUrl: data.winner.imageUrl ?? null,
        drawResultUrl: data.winner.drawResultUrl ?? null,
      });
      setMiniWinnerEditOpen(true);
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not open editor",
        message: e instanceof Error ? e.message : "Try again.",
      });
    }
  };

  // Filter mini draws by status
  const filteredMiniDraws = miniDraws.filter((draw) => {
    const matchesStatus = selectedStatus === "all" || draw.status === selectedStatus;
    const matchesSearch = searchTerm.trim() ? draw.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) : true;
    return matchesStatus && matchesSearch;
  });

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
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    switch (status) {
      case "active":
        return (
          <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
            {label}
          </AdminBadge>
        );
      case "completed":
        return (
          <AdminBadge variant="neutral" icon={Trophy}>
            {label}
          </AdminBadge>
        );
      case "cancelled":
        return (
          <AdminBadge variant="danger" icon={XCircle} iconClassName="text-red-600 dark:text-red-400">
            {label}
          </AdminBadge>
        );
      default:
        return (
          <AdminBadge variant="success" icon={CheckCircle}>
            {label}
          </AdminBadge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 dark:border-red-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <div className="w-full mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 font-['Poppins']">Mini Draw Management</h1>
            <p className="text-lg text-gray-600 dark:text-neutral-400 font-['Poppins']">
              Create and manage mini draws — winner testimony and photos are edited on each card after a winner exists
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Create Mini Draw
            </button>
            <button
              onClick={() => {
                if (isReorderMode) {
                  void handleCancelReorder();
                } else {
                  setIsReorderMode(true);
                  setIsOrderDirty(false);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow dark:shadow-none ${
                isReorderMode
                  ? "bg-gray-100 text-gray-700 dark:text-neutral-200 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  : "bg-white text-gray-700 dark:text-neutral-200 border border-gray-200 hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
              }`}
              disabled={isSavingOrder}
            >
              <Move className="w-4 h-4" />
              {isReorderMode ? "Cancel Reorder" : "Reorder Mini Draws"}
            </button>
          </div>
        </div>

        {isReorderMode && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Drag the cards to reorder them. Save when you&apos;re happy with the order.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleSaveOrder()}
                disabled={!isOrderDirty || isSavingOrder}
                className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingOrder ? "Saving..." : "Save Order"}
              </button>
              <button
                onClick={() => void handleCancelReorder()}
                disabled={isSavingOrder}
                className="px-4 py-2 rounded-lg font-semibold text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-900 hover:bg-amber-100 dark:hover:bg-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Discard Changes
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {["all", "active", "completed"].map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedStatus === status
                    ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg"
                    : "bg-white text-gray-700 dark:text-neutral-200 hover:bg-gray-50 border border-gray-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:border-neutral-700"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search mini draws by name..."
              className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 pr-10 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/40 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                <span className="text-xs font-semibold">Clear</span>
              </button>
            )}
          </div>
        </div>

        {!isReorderMode && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/90 dark:bg-blue-950/35 px-4 py-3 text-sm text-blue-950 dark:text-blue-100">
            <p className="font-semibold mb-1">Editing mini draw winners</p>
            <p className="text-blue-900/90 dark:text-blue-200/95 leading-relaxed">
              After you use <span className="font-medium">Winner</span> to record someone, that draw’s card shows{" "}
              <span className="font-medium">Edit winner & testimony</span> — open it to update photo, rich-text testimony,
              and the external draw result link. The <span className="font-medium">Draw Results</span> admin tab is for major
              draws only.
            </p>
          </div>
        )}

        {/* Mini Draws List - Always use compact grid layout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {filteredMiniDraws.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-8 text-center">
              <Trophy className="w-16 h-16 text-gray-400 dark:text-neutral-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-neutral-400">No mini draws found</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={filteredMiniDraws.map((draw) => draw._id)}
                strategy={rectSortingStrategy}
              >
                {filteredMiniDraws.map((draw) => (
                  <MiniDrawCard
                    key={draw._id}
                    draw={draw}
                    reorderMode={isReorderMode}
                    statusBadge={getStatusBadge(draw.status)}
                    onEdit={() => openEditModal(draw)}
                    onDelete={() => openDeleteModal(draw)}
                    onSelectWinner={() => {
                      setSelectedDraw(draw);
                      setIsWinnerModalOpen(true);
                    }}
                    onExportCsv={() => handleExport(draw._id, draw.name, "csv")}
                    onEditLatestWinner={() => void openMiniWinnerEdit(draw)}
                    isSelectingWinner={isSelectingWinner}
                    isExporting={isExporting}
                    isDeleting={deletingId === draw._id}
                  />
                ))}
              </SortableContext>
            </DndContext>
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
          window.dispatchEvent(new Event("admin-mini-draws-updated"));
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
            formData.append("selectedBy", session.user.id);

            if (winnerData.imageUrl) {
              formData.append("imageUrl", winnerData.imageUrl);
            }
            if (winnerData.testimony) {
              formData.append("testimony", winnerData.testimony);
            }
            if (winnerData.drawResultUrl) {
              formData.append("drawResultUrl", winnerData.drawResultUrl);
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
            window.dispatchEvent(new Event("admin-mini-draws-updated"));
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
                imageUrl: selectedDraw.latestWinner.imageUrl,
                drawResultUrl: selectedDraw.latestWinner.drawResultUrl,
              }
            : undefined
        }
        enableImageField
      />

      {miniWinnerEdit && (
        <WinnerEditModal
          isOpen={miniWinnerEditOpen}
          onClose={() => {
            setMiniWinnerEditOpen(false);
            setMiniWinnerEdit(null);
          }}
          winnerId={miniWinnerEdit.winnerId}
          winnerName={miniWinnerEdit.winnerName}
          drawName={miniWinnerEdit.drawName}
          drawType="mini"
          currentTestimony={miniWinnerEdit.testimony}
          currentSelectedPrize={null}
          currentImageUrl={miniWinnerEdit.imageUrl}
          currentDrawResultUrl={miniWinnerEdit.drawResultUrl}
          onUpdate={async () => {
            await fetchMiniDraws();
            window.dispatchEvent(new Event("admin-mini-draws-updated"));
          }}
        />
      )}

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
                brandId: editingDraw.brandId,
                displayOrder: editingDraw.displayOrder,
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

      <ConfirmationModal
        isOpen={isDeleteModalOpen && Boolean(deleteTarget)}
        onClose={closeDeleteModal}
        onConfirm={() => void confirmDelete()}
        type="cancel"
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete mini draw"}
        message="This will permanently remove the mini draw, including its configuration and history. This action cannot be undone."
        confirmText="Delete mini draw"
        cancelText="Keep mini draw"
        isLoading={Boolean(deleteTarget && deletingId === deleteTarget._id)}
      />
    </div>
  );
}

interface MiniDrawCardProps {
  draw: MiniDraw;
  reorderMode: boolean;
  statusBadge: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onSelectWinner: () => void;
  onExportCsv: () => void;
  onEditLatestWinner: () => void;
  isSelectingWinner: boolean;
  isExporting: boolean;
  isDeleting: boolean;
}

function MiniDrawCard({
  draw,
  reorderMode,
  statusBadge,
  onEdit,
  onDelete,
  onSelectWinner,
  onExportCsv,
  onEditLatestWinner,
  isSelectingWinner,
  isExporting,
  isDeleting,
}: MiniDrawCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draw._id,
    disabled: !reorderMode,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const brandMeta = getBrandMeta(draw.brandId) ?? null;
  const overlayBrand = brandMeta ?? defaultBrandLogo;
  const gradientOverride = brandMeta ? undefined : "bg-transparent";
  const overlayScale = brandMeta?.overlayScale ?? brandMeta?.imageScale ?? defaultBrandLogo.overlayScale ?? 1;
  const totalEntries = draw.totalEntries || 0;
  const minimumEntries = draw.minimumEntries || 0;
  const capacityPercentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;
  const previewImage = draw.prize.images?.[0] || "/images/placeholder.jpg";

  const isAt100 = capacityPercentage >= 100 || draw.status === "completed";
  const iconBtn =
    "flex items-center gap-2 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] md:text-xs font-medium text-gray-800 dark:text-neutral-200";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-95 z-50" : undefined}
      {...(reorderMode ? { ...attributes, ...listeners } : {})}
    >
      <div
        role={reorderMode ? undefined : "button"}
        tabIndex={reorderMode ? undefined : 0}
        onClick={reorderMode ? undefined : onEdit}
        onKeyDown={reorderMode ? undefined : (e) => e.key === "Enter" && onEdit()}
        className={`relative rounded-lg bg-white dark:bg-neutral-900 shadow-md dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden group transition-all flex flex-col h-[290px] md:h-[340px] ${reorderMode ? "cursor-grab active:cursor-grabbing touch-none" : "cursor-pointer hover:shadow-lg hover:border-red-200 dark:hover:border-red-800/60"}`}
      >
        <div className="relative w-full h-32 md:h-44 bg-gray-100 dark:bg-neutral-800">
          <Image
            src={previewImage}
            alt={draw.prize.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 20vw, 20vw"
            draggable={false}
          />
          <div className="absolute bottom-1.5 right-1.5 z-10">
            <BrandLogoCard
              brand={overlayBrand}
              className="px-1 py-0.5"
              widthClass="w-auto"
              heightClass="h-auto"
              overlayMode="overlay"
              gradientOverride={gradientOverride}
              scaleOverride={overlayScale * 0.6}
            />
          </div>
          {isAt100 && (
            <div
              className="absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold"
              title="100% - select winner"
            >
              100%
            </div>
          )}
          {!reorderMode && (
            <div className="absolute top-1.5 right-1.5 z-10">{statusBadge}</div>
          )}
        </div>
        <div className="px-2.5 pt-2.5 pb-2 md:px-4 md:pt-4 md:pb-3 md:space-y-3 space-y-2 flex-1 flex flex-col min-h-0">
          <div className="min-h-[2.5em] md:min-h-[2.75em] flex items-start overflow-hidden">
            <h3 className="text-xs md:text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight break-words">
              {draw.name}
            </h3>
          </div>
          <div className="space-y-1.5 shrink-0">
            <div className="flex items-center justify-between text-[10px] md:text-xs font-semibold text-gray-700 dark:text-neutral-300">
              <span className="truncate">
                {totalEntries.toLocaleString()}/{minimumEntries.toLocaleString()}
              </span>
              <span>{capacityPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-300"
                style={{ width: `${capacityPercentage}%` }}
              />
            </div>
          </div>
          {!reorderMode && draw.latestWinner && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditLatestWinner();
              }}
              className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-lg border-2 border-amber-300/80 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/45 px-2 py-2 text-[10px] sm:text-xs font-semibold text-amber-950 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
              title="Edit winner photo, testimony, and draw result link"
            >
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <span className="leading-tight text-center">Edit winner & testimony</span>
            </button>
          )}
          {!reorderMode && (
            <div
              className="flex items-center justify-between gap-2 md:gap-4 pt-2 border-t border-gray-100 dark:border-neutral-700 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectWinner();
                }}
                disabled={draw.totalEntries === 0 || isSelectingWinner}
                className={iconBtn}
                title={draw.totalEntries === 0 ? "No entries" : "Select winner"}
              >
                <Trophy className="w-3.5 h-3.5 shrink-0 text-red-600" />
                <span className="hidden md:inline truncate">Winner</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExportCsv();
                }}
                disabled={isExporting}
                className={iconBtn}
                title="Export CSV"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-green-600" />
                <span className="hidden md:inline truncate">CSV</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={isDeleting}
                className={iconBtn}
                title="Delete"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-red-600" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 shrink-0 text-red-600" />
                )}
                <span className="hidden md:inline truncate">Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
