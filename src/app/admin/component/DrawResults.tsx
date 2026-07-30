"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateInAEST } from "@/utils/common/timezone";
import {
  WinnerSelectionModal,
  WinnerEditModal,
  ExportModal,
  MajorDrawEditModal,
  type WinnerSelectionData,
} from "@/components/modals/draws";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { DrawsListPage, type DrawGroup, type DrawRow } from "@/components/admin/draws";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";

// Import MajorDrawData type from modal
type MajorDrawData = {
  _id: string;
  name: string;
  description: string;
  resultUrl?: string;
  watchUrl?: string;
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
  resultUrl?: string;
  watchUrl?: string;
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
  /** Derived net revenue — see src/services/admin/drawRevenue.ts. */
  revenue: number;
  /** null (never Infinity/NaN) when the draw has no entries. */
  revenuePerEntry: number | null;
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
    drawResultUrl?: string;
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
    stats: {
      totalDraws: number;
      totalEntries: number;
      totalPrizeValue: number;
      totalRevenue: number;
      drawsWithWinners: number;
      drawsWithoutWinners: number;
      winnerSelectionRate: number;
    };
  };
}

const HISTORY_ENDPOINT = "/api/admin/major-draw/history";

// Dropdown label ↔ API value. The design specifies human labels in the filter
// menus; the API takes enum values, so the two are mapped rather than letting
// display strings leak into query params.
const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Completed", value: "completed" },
  { label: "Frozen", value: "frozen" },
  { label: "Cancelled", value: "cancelled" },
  { label: "All", value: "" },
];

const WINNER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Any", value: "" },
  { label: "Published", value: "true" },
  { label: "Outstanding", value: "false" },
];

// No sort control. Results are always newest-draw-first, which is the only
// order this screen is read in; a dropdown for it cost horizontal space in the
// toolbar without earning it. The API still takes sortBy/sortOrder — they are
// just fixed below rather than user-selectable.
const DEFAULT_SORT_BY = "drawDate";
const DEFAULT_SORT_ORDER = "desc";

const labelFor = (options: Array<{ label: string; value: string }>, value: string) =>
  options.find((o) => o.value === value)?.label ?? options[0].label;
const valueFor = (options: Array<{ label: string; value: string }>, label: string) =>
  options.find((o) => o.label === label)?.value ?? "";

const currency = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(amount);

/** Per-entry needs cents; the KPI and column figures do not. */
const currencyPrecise = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(amount);

const compactCurrency = (amount: number) =>
  amount >= 1_000_000
    ? `$${(amount / 1_000_000).toFixed(2)}M`
    : amount >= 10_000
      ? `$${Math.round(amount / 1000)}K`
      : currency(amount);

export default function DrawResults() {
  const { showToast } = useToast();
  const { openUserModal } = useAdminUserModal();
  const [draws, setDraws] = useState<DrawResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
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
    totalRevenue: 0,
    drawsWithWinners: 0,
    drawsWithoutWinners: 0,
    winnerSelectionRate: 0,
  });

  // Filters
  const [filters, setFilters] = useState({
    status: "",
    hasWinner: "",
    search: "",
  });
  // Search hits the API so it spans every page, not just the loaded one.
  // Debounced because the fetch is keyed on it — otherwise a five-letter query
  // fires five requests.
  const debouncedSearch = useDebounce(filters.search, 300);
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

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
    drawResultUrl?: string | null;
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
      setErrorStatus(null);

      try {
        const queryParams = new URLSearchParams({
          page: page.toString(),
          limit: pagination.limit.toString(),
          sortBy: DEFAULT_SORT_BY,
          sortOrder: DEFAULT_SORT_ORDER,
          ...(filters.status && { status: filters.status }),
          ...(filters.hasWinner && { hasWinner: filters.hasWinner }),
          ...(debouncedSearch && { search: debouncedSearch }),
        });

        const response = await fetch(`${HISTORY_ENDPOINT}?${queryParams}`);
        if (!response.ok) {
          setErrorStatus(response.status);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
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
    [filters.status, filters.hasWinner, debouncedSearch, pagination.limit]
  );

  // Initial load + refetch whenever a filter changes
  useEffect(() => {
    fetchDraws();
  }, [fetchDraws]);

  const handlePageChange = (newPage: number) => {
    fetchDraws(newPage);
  };

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
            (w: { drawId: string; drawType: string }) => w.drawId === draw._id && w.drawType === "major"
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
                  drawResultUrl: winnerDetailsData.winner.drawResultUrl ?? null,
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
        drawResultUrl?: string | null;
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

      if (winnerData.drawResultUrl !== undefined) {
        requestBody.drawResultUrl = winnerData.drawResultUrl;
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

      showToast({
        type: "success",
        title: "Winner Recorded Successfully!",
        message: `Winner has been recorded for ${selectedDraw?.name || "the draw"}.`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Error recording winner:", err);

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
      resultUrl: draw.resultUrl ?? "",
      watchUrl: draw.watchUrl ?? "",
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

      await fetchDraws(pagination.currentPage);
      setIsEditDrawModalOpen(false);
      setEditingDraw(null);

      showToast({
        type: "success",
        title: "Draw Updated Successfully!",
        message: `${editingDraw.name} has been updated and changes are now live.`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Error updating draw:", err);

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

  const formatDate = (date: Date | string) => formatDateInAEST(new Date(date), "dd MMM yyyy, h:mm a");

  // ── Presentation mapping ────────────────────────────────────────────────
  const rows: DrawRow[] = useMemo(
    () =>
      draws.map((draw) => {
        const hasWinner = !!(draw.winner && draw.winner.userId);
        const winnerName = draw.winner?.userDetails
          ? `${draw.winner.userDetails.firstName} ${draw.winner.userDetails.lastName}`.trim()
          : hasWinner
            ? `User ${draw.winner?.userId?.slice(-6)}`
            : "Awaiting winner";

        return {
          id: draw._id,
          name: draw.name,
          kind: "Major draw",
          date: formatDate(draw.drawDate),
          status: draw.status,
          entries: draw.totalEntries,
          entriesLabel: draw.totalEntries.toLocaleString(),
          revenue: draw.revenue ?? 0,
          revenueLabel: currency(draw.revenue ?? 0),
          revenuePerEntryLabel:
            draw.revenuePerEntry == null ? "—" : `${currencyPrecise(draw.revenuePerEntry)} / entry`,
          prizeValueLabel: draw.prize?.value ? currency(draw.prize.value) : "No prize value",
          trailing: winnerName,
          trailingSub: hasWinner
            ? draw.resultUrl
              ? "randomdraws · verified"
              : `Entry #${draw.winner?.entryNumber ?? "—"}`
            : "needs action",
          locked: !!draw.configurationLocked,
          hasWinner,
        };
      }),
    [draws]
  );

  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;
  const selectedDrawResult = draws.find((draw) => draw._id === selectedRowId) ?? null;
  const searchTerm = filters.search.trim();

  /**
   * Results groups by year. With a search active the grouped view collapses
   * into a single "Search results" group, per the design.
   */
  const groups: DrawGroup[] = useMemo(() => {
    if (searchTerm) {
      return [
        {
          label: "Search results",
          meta: `${rows.length} ${rows.length === 1 ? "draw matches" : "draws match"} “${searchTerm}”`,
          rows,
        },
      ];
    }

    const yearOf = new Map(draws.map((d) => [d._id, d.drawDate ? String(new Date(d.drawDate).getFullYear()) : "Undated"]));
    const byYear = new Map<string, DrawRow[]>();
    for (const row of rows) {
      const year = yearOf.get(row.id) ?? "Undated";
      byYear.set(year, [...(byYear.get(year) ?? []), row]);
    }

    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, yearRows]) => {
        const revenue = yearRows.reduce((sum, r) => sum + r.revenue, 0);
        const outstanding = yearRows.filter((r) => !r.hasWinner).length;
        const parts = [
          `${yearRows.length} ${yearRows.length === 1 ? "draw" : "draws"}`,
          `${currency(revenue)} revenue`,
        ];
        if (outstanding > 0) {
          parts.push(`${outstanding} winner${outstanding === 1 ? "" : "s"} outstanding`);
        }
        return { label: year, meta: parts.join(" · "), rows: yearRows };
      });
  }, [rows, draws, searchTerm]);

  const dataState = isLoading ? "loading" : error ? "error" : rows.length === 0 ? "empty" : "ready";

  const emptyTitle = searchTerm ? `No draws match “${searchTerm}”` : "No results match these filters";
  const emptyBody = searchTerm
    ? "Nothing in the draw history matches that name or description. Clear the search to see every result."
    : "No completed draw matches this status and winner combination. Clear the filters to see all results.";

  // Clears the query AND the dropdowns — not just the dropdowns.
  const clearFilters = () => {
    setFilters({ status: "", hasWinner: "", search: "" });
    setOpenFilterKey(null);
  };

  const onPickFilter = (key: string, label: string) => {
    setOpenFilterKey(null);
    if (key === "status") setFilters((prev) => ({ ...prev, status: valueFor(STATUS_OPTIONS, label) }));
    if (key === "winner") setFilters((prev) => ({ ...prev, hasWinner: valueFor(WINNER_OPTIONS, label) }));
  };

  const drawById = (id: string) => draws.find((draw) => draw._id === id);

  return (
    <>
      <DrawsListPage
        variant="results"
        kpis={[
          { label: "Completed draws", value: stats.totalDraws.toLocaleString() },
          { label: "Total entries", value: stats.totalEntries.toLocaleString() },
          { label: "Draw revenue", value: compactCurrency(stats.totalRevenue ?? 0) },
          { label: "Prize value awarded", value: compactCurrency(stats.totalPrizeValue) },
        ]}
        searchValue={filters.search}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
        searchPlaceholder="Search draws…"
        filters={[
          {
            key: "status",
            label: "Status",
            value: labelFor(STATUS_OPTIONS, filters.status),
            options: STATUS_OPTIONS.map((o) => o.label),
          },
          {
            key: "winner",
            label: "Winner",
            value: labelFor(WINNER_OPTIONS, filters.hasWinner),
            options: WINNER_OPTIONS.map((o) => o.label),
          },
        ]}
        openFilterKey={openFilterKey}
        onToggleFilter={setOpenFilterKey}
        onPickFilter={onPickFilter}
        groups={groups}
        dataState={dataState}
        selectedRow={selectedRow}
        onSelectRow={(row) => setSelectedRowId(row?.id ?? null)}
        onClearFilters={clearFilters}
        onRetry={() => fetchDraws(pagination.currentPage)}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        errorEndpoint={`GET ${HISTORY_ENDPOINT}${errorStatus ? ` · ${errorStatus}` : ""}`}
        verificationUrl={selectedDrawResult?.resultUrl ?? null}
        // Primary edits the winner when there is one, otherwise records one —
        // the two states the old card list exposed as separate buttons.
        onInspectorPrimary={(row) => {
          const draw = drawById(row.id);
          if (!draw) return;
          if (row.hasWinner) void handleEditWinner(draw);
          else handleSelectWinner(draw);
        }}
        onEditDraw={(row) => {
          const draw = drawById(row.id);
          if (draw) handleEditDraw(draw);
        }}
        onExport={(row) => {
          const draw = drawById(row.id);
          if (draw) handleExport(draw);
        }}
        onRemoveWinner={(row) => {
          const draw = drawById(row.id);
          if (draw) setRemoveWinnerTarget(draw);
        }}
        onOpenWinnerUser={(row) => {
          const draw = drawById(row.id);
          if (draw?.winner?.userId) openUserModal(draw.winner.userId);
        }}
        footer={
          pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-[10px] rounded-[var(--m-radius)] border border-[var(--line)] bg-[var(--panel)] px-[14px] py-[10px] shadow-[var(--shadow)]">
              <div className="flex items-center gap-[6px]">
                <PagerButton
                  onClick={() => handlePageChange(1)}
                  disabled={!pagination.hasPrevPage || isLoading}
                  label="First page"
                >
                  <ChevronsLeft className="h-[15px] w-[15px]" />
                </PagerButton>
                <PagerButton
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={!pagination.hasPrevPage || isLoading}
                  label="Previous page"
                >
                  <ChevronLeft className="h-[15px] w-[15px]" />
                </PagerButton>
              </div>
              <span data-figure className="text-[12px] font-medium text-[var(--text2)]">
                Page {pagination.currentPage} of {pagination.totalPages} · {pagination.totalCount.toLocaleString()} draws
              </span>
              <div className="flex items-center gap-[6px]">
                <PagerButton
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.hasNextPage || isLoading}
                  label="Next page"
                >
                  <ChevronRight className="h-[15px] w-[15px]" />
                </PagerButton>
                <PagerButton
                  onClick={() => handlePageChange(pagination.totalPages)}
                  disabled={!pagination.hasNextPage || isLoading}
                  label="Last page"
                >
                  <ChevronsRight className="h-[15px] w-[15px]" />
                </PagerButton>
              </div>
            </div>
          ) : null
        }
      />

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
          enableImageField
          currentWinner={
            selectedDraw.winner
              ? {
                  userId: selectedDraw.winner.userId,
                  imageUrl: selectedDraw.winner.imageUrl,
                  drawResultUrl: selectedDraw.winner.drawResultUrl,
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
          currentDrawResultUrl={editingWinner.drawResultUrl}
          onUpdate={async () => {
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
    </>
  );
}

function PagerButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-[var(--m-icon)] w-[var(--m-icon)] items-center justify-center rounded-[7px] border border-[var(--line)] bg-[var(--panel)] text-[var(--text2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
