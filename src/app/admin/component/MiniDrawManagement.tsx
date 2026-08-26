"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Move, Trophy, AlertTriangle, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  AdminMiniDrawModal,
  WinnerSelectionModal,
  WinnerEditModal,
  MiniDrawEditModal,
  ParticipantsModal,
  type WinnerSelectionData,
  type AdminMiniDrawSummary,
  type MiniDrawEditPayload,
} from "@/components/modals/draws";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { cn } from "@/utils/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { getBrandMeta } from "@/utils/brand-utils";
import { DrawsPageShell, DrawsToolbar, MiniDrawCard } from "@/components/admin/draws";

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

/**
 * "At capacity" is NOT a stored status — the MiniDraw enum is
 * active | completed | cancelled. It is derived, and the same predicate drives
 * the chip count and the amber notice strip. Do not add a status to the model.
 */
const isAtCapacity = (draw: MiniDraw) =>
  draw.status === "active" && draw.minimumEntries > 0 && draw.totalEntries >= draw.minimumEntries;

type StatusChip = "all" | "active" | "at-capacity" | "completed";

const CHIP_LABEL: Record<StatusChip, string> = {
  all: "All",
  active: "Active",
  "at-capacity": "At capacity",
  completed: "Completed",
};

/**
 * Sort orders for the card grid.
 *
 * "Display order" is the DEFAULT and is the drag-ordered lineup the customer
 * site renders — it must stay first and stay the default, because it is the only
 * order that reorder mode can safely write back (see `enterReorderMode`).
 *
 * The rest are read-only lenses for managing the lineup: which draws are earning,
 * which are about to fill and need a winner queued, which are stalling.
 */
const SORT_LABEL = {
  order: "Display order",
  "entries-desc": "Most entries",
  "entries-asc": "Fewest entries",
  "fill-desc": "Closest to capacity",
  "fill-asc": "Furthest from capacity",
  "name-asc": "Name (A–Z)",
} as const;

type SortKey = keyof typeof SORT_LABEL;

const SORT_OPTIONS = Object.values(SORT_LABEL);
const SORT_KEY_BY_LABEL = Object.fromEntries(
  (Object.entries(SORT_LABEL) as Array<[SortKey, string]>).map(([key, label]) => [label, key])
) as Record<string, SortKey>;

const ALL_BRANDS = "All brands";

/** Percentage of the entry threshold reached. 0 when no threshold is set. */
const fillPercent = (draw: { totalEntries?: number; minimumEntries?: number }) =>
  (draw.minimumEntries ?? 0) > 0
    ? Math.min(100, Math.round(((draw.totalEntries ?? 0) / (draw.minimumEntries ?? 1)) * 100))
    : 0;

export default function MiniDrawManagement() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const { has } = usePermissions();
  const canEditMini = has("miniDraws.edit");
  const canDeleteMini = has("miniDraws.delete");
  const canSelectMiniWinner = has("miniDraws.selectWinner");
  /** Entrant PII — the roster and the export are the same data, so they share one gate. */
  const canViewParticipants = has("miniDraws.viewParticipants");
  const [participantsDraw, setParticipantsDraw] = useState<MiniDraw | null>(null);
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
  const [selectedStatus, setSelectedStatus] = useState<StatusChip>("all");
  // Pre-fill the search box from `?search=` (e.g. deep-link from the Overview
  // "Top mini draws" card). Read once on mount — the user can edit/clear after.
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("order");
  const [brandFilter, setBrandFilter] = useState<string>(ALL_BRANDS);
  /** Which toolbar dropdown is open — only one at a time, owned here per DrawsToolbar's contract. */
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
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
        showToast({ type: "error", title: "Failed to load mini draws" });
      }
    } catch (error) {
      console.error("Error fetching mini draws:", error);
      showToast({ type: "error", title: "Failed to load mini draws" });
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
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
      setIsOrderDirty(true);
    },
    [isReorderMode]
  );

  const handleSaveOrder = useCallback(async () => {
    if (!isOrderDirty || isSavingOrder) return;
    try {
      setIsSavingOrder(true);
      const orderedIds = miniDraws.map((draw) => draw._id);
      const response = await fetch("/api/admin/mini-draw/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to save order");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to update mini draw");

      showToast({ type: "success", title: "Mini draw updated", message: "Your changes have been saved." });
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
    if (!deleteTarget) return;
    setDeletingId(deleteTarget._id);
    try {
      const response = await fetch(`/api/admin/mini-draw/${deleteTarget._id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to delete mini draw");

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
      if (!res.ok || !data.success || !data.winner) throw new Error(data.error || "Failed to load winner");

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
        showToast({ type: "error", title: "Export failed" });
      }
    } catch (error) {
      console.error("Error exporting:", error);
      showToast({ type: "error", title: "Export failed" });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Filtering ───────────────────────────────────────────────────────────
  // The design filters cards by product name, brand AND status; the old filter
  // matched name only.
  const query = searchTerm.trim().toLowerCase();
  const filteredMiniDraws = useMemo(() => {
    const rows = miniDraws.filter((draw) => {
      const matchesStatus =
        selectedStatus === "all"
          ? true
          : selectedStatus === "at-capacity"
            ? isAtCapacity(draw)
            : draw.status === selectedStatus;
      if (!matchesStatus) return false;

      const brandLabel = getBrandMeta(draw.brandId)?.name ?? "";
      if (brandFilter !== ALL_BRANDS && brandLabel !== brandFilter) return false;

      if (!query) return true;
      return `${draw.name} ${brandLabel} ${draw.status}`.toLowerCase().includes(query);
    });

    // Reorder mode ALWAYS renders the stored display order. Dragging a card
    // computes its new index against the full `miniDraws` array and Save posts
    // that array, so sorting the view by anything else would let the operator
    // drag against one order and write a different one. Forcing it here (rather
    // than only resetting on entry) also covers picking a sort while already in
    // reorder mode.
    if (isReorderMode || sortKey === "order") return rows;

    const sorted = [...rows];
    switch (sortKey) {
      case "entries-desc":
        sorted.sort((a, b) => (b.totalEntries || 0) - (a.totalEntries || 0));
        break;
      case "entries-asc":
        sorted.sort((a, b) => (a.totalEntries || 0) - (b.totalEntries || 0));
        break;
      // Fill ties are broken by raw entries so a wall of 0% draws still ranks
      // usefully instead of falling back to insertion order.
      case "fill-desc":
        sorted.sort((a, b) => fillPercent(b) - fillPercent(a) || (b.totalEntries || 0) - (a.totalEntries || 0));
        break;
      case "fill-asc":
        sorted.sort((a, b) => fillPercent(a) - fillPercent(b) || (a.totalEntries || 0) - (b.totalEntries || 0));
        break;
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [miniDraws, selectedStatus, brandFilter, query, sortKey, isReorderMode]);

  /** Only brands that actually appear in the lineup — no dead options. */
  const brandOptions = useMemo(() => {
    const names = new Set<string>();
    for (const draw of miniDraws) {
      const name = getBrandMeta(draw.brandId)?.name;
      if (name) names.add(name);
    }
    return [ALL_BRANDS, ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [miniDraws]);

  const isFiltered =
    query.length > 0 || selectedStatus !== "all" || brandFilter !== ALL_BRANDS || sortKey !== "order";

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedStatus("all");
    setBrandFilter(ALL_BRANDS);
    setSortKey("order");
    setOpenFilterKey(null);
  }, []);

  /**
   * Entering reorder mode clears every filter and sort first.
   *
   * You can only safely drag what you can fully see: a drag computes indices
   * against the WHOLE list, so reordering a filtered subset moves cards past
   * hidden neighbours and Save writes an order the operator never saw. Resetting
   * (rather than disabling the button) keeps it one click with nothing to undo.
   */
  const enterReorderMode = useCallback(() => {
    if (isFiltered) {
      clearFilters();
      showToast({
        type: "info",
        title: "Filters cleared for reordering",
        message: "Reordering applies to the full lineup, so the list was reset to display order.",
      });
    }
    setIsReorderMode(true);
    setIsOrderDirty(false);
  }, [isFiltered, clearFilters, showToast]);

  const counts = useMemo(
    () => ({
      all: miniDraws.length,
      active: miniDraws.filter((d) => d.status === "active").length,
      "at-capacity": miniDraws.filter(isAtCapacity).length,
      completed: miniDraws.filter((d) => d.status === "completed").length,
    }),
    [miniDraws]
  );

  const atCapacityDraws = useMemo(() => miniDraws.filter(isAtCapacity), [miniDraws]);

  return (
    <DrawsPageShell
      notice={
        atCapacityDraws.length > 0 && !isReorderMode ? (
          <div className="flex flex-wrap items-center gap-[10px] rounded-[var(--m-radius)] border border-[var(--warn-line)] bg-[var(--warn-bg)] px-[14px] py-[10px]">
            <AlertTriangle className="h-[16px] w-[16px] shrink-0 text-[var(--warn)]" aria-hidden />
            <p className="min-w-0 flex-1 text-[12.5px] font-medium text-[var(--warn)]">
              {atCapacityDraws.length} mini {atCapacityDraws.length === 1 ? "draw has" : "draws have"} hit the entry
              threshold and {atCapacityDraws.length === 1 ? "is" : "are"} ready for a winner.
            </p>
            <button
              type="button"
              onClick={() => setSelectedStatus("at-capacity")}
              className="flex h-[var(--m-btn-sm)] items-center rounded-[8px] border border-[var(--warn-line)] bg-[var(--panel)] px-[12px] text-[12px] font-semibold text-[var(--warn)]"
            >
              Review
            </button>
          </div>
        ) : null
      }
    >
      <DrawsToolbar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, brand or status…"
        // Hidden in reorder mode: the grid is pinned to display order there, so
        // offering a sort that cannot apply would just read as broken.
        filters={
          isReorderMode
            ? []
            : [
                { key: "sort", label: "Sort", value: SORT_LABEL[sortKey], options: SORT_OPTIONS },
                ...(brandOptions.length > 2
                  ? [{ key: "brand", label: "Brand", value: brandFilter, options: brandOptions }]
                  : []),
              ]
        }
        openFilterKey={openFilterKey}
        onToggleFilter={setOpenFilterKey}
        onPickFilter={(key, option) => {
          if (key === "sort") setSortKey(SORT_KEY_BY_LABEL[option] ?? "order");
          if (key === "brand") setBrandFilter(option);
          setOpenFilterKey(null);
        }}
        actions={[
          ...(canEditMini
            ? [{ label: "New mini draw", icon: Plus, onClick: () => setIsModalOpen(true) }]
            : []),
          {
            label: isReorderMode ? "Cancel reorder" : "Reorder",
            icon: Move,
            variant: "secondary" as const,
            onClick: () => {
              if (isReorderMode) void handleCancelReorder();
              else enterReorderMode();
            },
          },
        ]}
      >
        {/* Status chips with live counts. Scrolls horizontally on mobile.
            No negative margin — it pulled the first chip under the toolbar's own
            padding and clipped the active one's label. */}
        <div className="flex w-full max-w-full items-center gap-[6px] overflow-x-auto [scrollbar-width:none] draws:w-auto [&::-webkit-scrollbar]:hidden">
          {(Object.keys(CHIP_LABEL) as StatusChip[]).map((chip) => {
            const active = selectedStatus === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setSelectedStatus(chip)}
                aria-pressed={active}
                className={cn(
                  "flex h-[var(--m-btn-sm)] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[7px] border px-[10px] text-[12px] font-semibold",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)] bg-[var(--input-bg)] text-[var(--text2)] hover:text-[var(--text)]"
                )}
              >
                {CHIP_LABEL[chip]}
                <span data-figure className="text-[11px] opacity-70">
                  {counts[chip]}
                </span>
              </button>
            );
          })}
        </div>
      </DrawsToolbar>

      {/* Result count + a single reset. A sort or brand filter is far less visible
          than the status chips (which carry their own counts), so without this an
          operator can be looking at a subset and not realise it. */}
      {!isReorderMode && !isLoading && isFiltered && (
        <div className="flex flex-wrap items-center justify-between gap-[8px] px-[2px]">
          <p className="text-[12px] text-[var(--text2)]">
            Showing{" "}
            <span data-figure className="font-semibold text-[var(--text)]">
              {filteredMiniDraws.length}
            </span>{" "}
            of{" "}
            <span data-figure className="font-semibold text-[var(--text)]">
              {miniDraws.length}
            </span>{" "}
            mini draws
            {sortKey !== "order" && ` · sorted by ${SORT_LABEL[sortKey].toLowerCase()}`}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-[var(--m-btn-sm)] items-center gap-[6px] rounded-[8px] border border-[var(--line)] bg-[var(--panel)] px-[10px] text-[12px] font-semibold text-[var(--text2)] hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
          >
            <X className="h-[13px] w-[13px]" />
            Clear filters
          </button>
        </div>
      )}

      {isReorderMode && (
        <div className="flex flex-wrap items-center justify-between gap-[10px] rounded-[var(--m-radius)] border border-[var(--warn-line)] bg-[var(--warn-bg)] px-[14px] py-[10px]">
          <p className="text-[12.5px] text-[var(--warn)]">
            Drag the cards to reorder them. Save when you&apos;re happy with the order.
          </p>
          <div className="flex flex-wrap gap-[8px]">
            <button
              type="button"
              onClick={() => void handleSaveOrder()}
              disabled={!isOrderDirty || isSavingOrder}
              className="flex h-[var(--m-btn-sm)] items-center rounded-[8px] bg-[var(--accent)] px-[12px] text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingOrder ? "Saving…" : "Save order"}
            </button>
            <button
              type="button"
              onClick={() => void handleCancelReorder()}
              disabled={isSavingOrder}
              className="flex h-[var(--m-btn-sm)] items-center rounded-[8px] border border-[var(--warn-line)] bg-[var(--panel)] px-[12px] text-[12px] font-semibold text-[var(--warn)] disabled:opacity-50"
            >
              Discard changes
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-[var(--m-gap)] draws:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-[11px] border border-[var(--line)] bg-[var(--panel)]"
              aria-busy="true"
            >
              <div className="admin-draws-skeleton aspect-[4/3] w-full" />
              <div className="space-y-[8px] p-[10px]">
                <div className="admin-draws-skeleton h-[13px] w-4/5 rounded-[5px]" />
                <div className="admin-draws-skeleton h-[11px] w-1/2 rounded-[5px]" />
                <div className="admin-draws-skeleton h-[5px] w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredMiniDraws.length === 0 ? (
        <div className="flex flex-col items-center rounded-[var(--m-radius)] border border-[var(--line)] bg-[var(--panel)] px-[20px] py-[46px] text-center">
          <Trophy className="h-[26px] w-[26px] text-[var(--text3)]" aria-hidden />
          <div className="mt-[12px] font-poppins text-[14.5px] font-bold text-[var(--text)]">
            {query ? `No mini draw matches “${searchTerm.trim()}”` : "No mini draws match this filter"}
          </div>
          <p className="mt-[6px] max-w-[330px] text-[12.5px] leading-[1.6] text-[var(--text2)] text-pretty">
            {query
              ? "Nothing matches that product name, brand or status. Try a shorter term, or clear the search."
              : brandFilter !== ALL_BRANDS
                ? `No mini draws under ${brandFilter} with the status you picked.`
                : "Nothing sits under the status you picked. Switch back to All to see every mini draw."}
          </p>
          {/* Routes through the shared reset — clearing only search + status would
              leave a brand filter on and the button would appear not to work. */}
          <button
            type="button"
            onClick={clearFilters}
            className="mt-[15px] flex h-[var(--m-btn-h)] items-center rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[15px] text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
          >
            {query ? "Clear search" : "Show all"}
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredMiniDraws.map((draw) => draw._id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-[var(--m-gap)] draws:grid-cols-5">
              {filteredMiniDraws.map((draw) => (
                <MiniDrawCard
                  key={draw._id}
                  draw={draw}
                  reorderMode={isReorderMode}
                  onEdit={canEditMini ? () => openEditModal(draw) : undefined}
                  onDelete={canDeleteMini ? () => openDeleteModal(draw) : undefined}
                  onSelectWinner={
                    canSelectMiniWinner
                      ? () => {
                          setSelectedDraw(draw);
                          setIsWinnerModalOpen(true);
                        }
                      : undefined
                  }
                  onExportCsv={canViewParticipants ? () => handleExport(draw._id, draw.name, "csv") : undefined}
                  onViewParticipants={canViewParticipants ? () => setParticipantsDraw(draw) : undefined}
                  onEditLatestWinner={canEditMini ? () => void openMiniWinnerEdit(draw) : undefined}
                  isSelectingWinner={isSelectingWinner}
                  isExporting={isExporting}
                  isDeleting={deletingId === draw._id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Entry pool — the in-app answer to "who entered?", so staff don't have to download a
          spreadsheet of everyone's personal details to check one person. Mounted only while a
          draw is picked so the modal's fetch is always keyed to a real id. */}
      {participantsDraw && (
        <ParticipantsModal
          isOpen
          onClose={() => setParticipantsDraw(null)}
          drawId={participantsDraw._id}
          drawName={participantsDraw.name}
          drawType="mini"
        />
      )}

      {/* Create Modal */}
      <AdminMiniDrawModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchMiniDraws();
          setIsModalOpen(false);
          window.dispatchEvent(new Event("admin-mini-draws-updated"));
          showToast({ type: "success", title: "Mini draw created successfully" });
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

            if (winnerData.imageUrl) formData.append("imageUrl", winnerData.imageUrl);
            if (winnerData.testimony) formData.append("testimony", winnerData.testimony);
            if (winnerData.drawResultUrl) formData.append("drawResultUrl", winnerData.drawResultUrl);

            const response = await fetch(`/api/admin/mini-draw/${winnerData.drawId}/select-winner`, {
              method: "POST",
              body: formData,
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to record winner");

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
        message={
          deleteTarget && deleteTarget.totalEntries > 0
            ? `This permanently removes the mini draw, its configuration and its history. ${deleteTarget.totalEntries.toLocaleString()} entries have already been recorded against it. This action cannot be undone.`
            : "This will permanently remove the mini draw, including its configuration and history. This action cannot be undone."
        }
        confirmText="Delete mini draw"
        cancelText="Keep it"
        isLoading={Boolean(deleteTarget && deletingId === deleteTarget._id)}
      />
    </DrawsPageShell>
  );
}
