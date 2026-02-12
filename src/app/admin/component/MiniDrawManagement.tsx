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
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Trash2,
  Loader2,
  Move,
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
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow ${
                isReorderMode
                  ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              }`}
              disabled={isSavingOrder}
            >
              <Move className="w-4 h-4" />
              {isReorderMode ? "Cancel Reorder" : "Reorder Mini Draws"}
            </button>
          </div>
        </div>

        {isReorderMode && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900">
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
                className="px-4 py-2 rounded-lg font-semibold text-amber-900 border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Discard Changes
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-3">
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
          <div className="relative max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search mini draws by name..."
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 pr-10 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                <span className="text-xs font-semibold">Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Mini Draws List */}
        <div
          className={
            isReorderMode
              ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3"
              : "grid gap-4"
          }
        >
          {filteredMiniDraws.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
              <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No mini draws found</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={filteredMiniDraws.map((draw) => draw._id)}
                strategy={isReorderMode ? rectSortingStrategy : verticalListSortingStrategy}
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
                    onExportExcel={() => handleExport(draw._id, draw.name, "excel")}
                    onRefresh={() => fetchMiniDraws()}
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
  onExportExcel: () => void;
  onRefresh: () => void;
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
  onExportExcel,
  onRefresh,
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
  const entriesRemaining = Math.max(minimumEntries - totalEntries, 0);
  const capacityPercentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;
  const previewImage = draw.prize.images?.[0] || "/images/placeholder.jpg";

  if (reorderMode) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={isDragging ? "opacity-95 z-50" : undefined}
        {...attributes}
        {...listeners}
      >
        <div className="relative rounded-lg bg-white shadow-md border border-gray-200 overflow-hidden group transition-all flex flex-col cursor-grab active:cursor-grabbing touch-none">
          <div className="relative w-full h-32 bg-gray-100">
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
          </div>
          <div className="p-2.5 space-y-2 flex-1 flex flex-col">
            <div className="flex-1 min-h-0">
              <h3 className="text-xs font-bold text-gray-900 line-clamp-1 leading-tight">{draw.name}</h3>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-gray-700">
                <span className="truncate">
                  {totalEntries.toLocaleString()}/{minimumEntries.toLocaleString()}
                </span>
                <span>{capacityPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-300"
                  style={{ width: `${capacityPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const actionButtonBase =
    "flex items-center gap-1.5 rounded-lg text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 transition-all";

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-95" : undefined}>
      <div className="relative rounded-[24px] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.08)] overflow-hidden group transition-all flex flex-col">
        <div className="relative w-full h-48 bg-gray-100">
          <Image
            src={previewImage}
            alt={draw.prize.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          <div className="absolute bottom-3 right-3 z-10">
            <BrandLogoCard
              brand={overlayBrand}
              className="px-2 py-1"
              widthClass="w-auto"
              heightClass="h-auto"
              overlayMode="overlay"
              gradientOverride={gradientOverride}
              scaleOverride={overlayScale}
            />
          </div>
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <div className="relative bg-gradient-to-r from-[#ee0000] to-[#cc0000] text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg shadow-[#ee0000]/40">
              {entriesRemaining > 0 ? `${entriesRemaining.toLocaleString()} entries left` : "Entries Closed"}
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-2xl font-bold text-gray-900">{draw.name}</h3>
            {statusBadge}
          </div>
          <div
            className="text-gray-600 [&_p]:my-0"
            dangerouslySetInnerHTML={{ __html: draw.description || "" }}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-red-600" />
              {draw.prize.name}
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-red-600" />
              {draw.totalEntries.toLocaleString()} entries
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              {entriesRemaining.toLocaleString()} remaining
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-red-600" />
              Cycle #{draw.cycle}
            </div>
          </div>
          {draw.latestWinner && (
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Latest Winner</p>
                  <p className="text-xs text-gray-600">
                    Selected {new Date(draw.latestWinner.selectedDate).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs font-medium text-gray-500">Entry #{draw.latestWinner.entryNumber}</span>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
              <span>
                {totalEntries.toLocaleString()} / {minimumEntries.toLocaleString()}
              </span>
              <span>{capacityPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-300"
                style={{ width: `${capacityPercentage}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={onEdit} className={`${actionButtonBase} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={onSelectWinner}
              disabled={draw.totalEntries === 0 || isSelectingWinner}
              className={`${actionButtonBase} shadow-md ${
                draw.totalEntries === 0 || isSelectingWinner
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800"
              }`}
            >
              <Trophy className="w-4 h-4" />
              {draw.totalEntries === 0 ? "No Entries" : "Select Winner"}
            </button>
            <button
              onClick={onExportCsv}
              disabled={isExporting}
              className={`${actionButtonBase} bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
            <button
              onClick={onExportExcel}
              disabled={isExporting}
              className={`${actionButtonBase} bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExporting ? "Exporting..." : "Export Excel"}
            </button>
            <button onClick={onRefresh} className={`${actionButtonBase} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className={`${actionButtonBase} border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60`}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
