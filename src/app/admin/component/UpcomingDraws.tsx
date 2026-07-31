"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateInLocal } from "@/utils/common/timezone";
import { MajorDrawEditModal, AdminMajorDrawModal, DrawLockedModal } from "@/components/modals/draws";
import { DrawsListPage, type DrawGroup, type DrawRow } from "@/components/admin/draws";
import { usePermissions } from "@/hooks/usePermissions";

// Import the MajorDrawData type from the modal
interface MajorDrawData {
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
      totalRevenue: number;
      drawsWithWinners: number;
      drawsWithoutWinners: number;
      winnerSelectionRate: number;
    };
  };
}

const HISTORY_ENDPOINT = "/api/admin/major-draw/history";

/**
 * "Queued & Active" is the default view but the API's Zod schema takes a SINGLE
 * status enum, so that option fans out into two parallel requests whose results
 * and stats are merged. Load-bearing — do not collapse it into one request.
 */
const COMBINED_STATUS = "queued,active";

const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All", value: COMBINED_STATUS },
  { label: "Active", value: "active" },
  { label: "Queued", value: "queued" },
  { label: "Cancelled", value: "cancelled" },
];

// No sort control. Upcoming is always soonest-draw-first — the only order a
// schedule is read in — so a dropdown for it cost toolbar space without earning
// it. The API still takes sortBy/sortOrder; they are just fixed here.
const DEFAULT_SORT_BY = "drawDate";
const DEFAULT_SORT_ORDER = "asc";

const labelFor = (options: Array<{ label: string; value: string }>, value: string) =>
  options.find((o) => o.value === value)?.label ?? options[0].label;
const valueFor = (options: Array<{ label: string; value: string }>, label: string) =>
  options.find((o) => o.label === label)?.value ?? "";

const currency = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(amount);

const currencyPrecise = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(amount);

const compactCurrency = (amount: number) =>
  amount >= 1_000_000
    ? `$${(amount / 1_000_000).toFixed(2)}M`
    : amount >= 10_000
      ? `$${Math.round(amount / 1000)}K`
      : currency(amount);

export default function UpcomingDraws() {
  const { showToast } = useToast();
  const { has } = usePermissions();
  const canEditMajor = has("majorDraw.edit");

  const [draws, setDraws] = useState<UpcomingDraw[]>([]);
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
    status: COMBINED_STATUS,
    search: "",
  });
  const debouncedSearch = useDebounce(filters.search, 300);
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Modals
  const [selectedDraw, setSelectedDraw] = useState<UpcomingDraw | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [lockedNoticeDraw, setLockedNoticeDraw] = useState<UpcomingDraw | null>(null);

  // Fetch draws
  const fetchDraws = useCallback(
    async (page: number = 1) => {
      setIsLoading(true);
      setError(null);
      setErrorStatus(null);

      const baseParams = (status?: string) =>
        new URLSearchParams({
          page: page.toString(),
          limit: pagination.limit.toString(),
          sortBy: DEFAULT_SORT_BY,
          sortOrder: DEFAULT_SORT_ORDER,
          ...(status && { status }),
          ...(debouncedSearch && { search: debouncedSearch }),
        });

      try {
        if (filters.status === COMBINED_STATUS) {
          // Two calls because the API takes one status enum. Merged below.
          const [queuedResponse, activeResponse] = await Promise.all([
            fetch(`${HISTORY_ENDPOINT}?${baseParams("queued")}`),
            fetch(`${HISTORY_ENDPOINT}?${baseParams("active")}`),
          ]);

          if (!queuedResponse.ok || !activeResponse.ok) {
            setErrorStatus(queuedResponse.ok ? activeResponse.status : queuedResponse.status);
            throw new Error("Failed to fetch draws");
          }

          const [queuedData, activeData] = (await Promise.all([queuedResponse.json(), activeResponse.json()])) as [
            UpcomingDrawsResponse,
            UpcomingDrawsResponse,
          ];

          if (!queuedData.success || !activeData.success) throw new Error("Failed to fetch draws");

          const combinedDraws = [...queuedData.data.draws, ...activeData.data.draws];
          const drawsWithWinners = queuedData.data.stats.drawsWithWinners + activeData.data.stats.drawsWithWinners;
          const drawsWithoutWinners =
            queuedData.data.stats.drawsWithoutWinners + activeData.data.stats.drawsWithoutWinners;
          const totalWithOutcome = drawsWithWinners + drawsWithoutWinners;

          setDraws(combinedDraws);
          setPagination(queuedData.data.pagination); // queued pagination as the base
          setStats({
            totalDraws: queuedData.data.stats.totalDraws + activeData.data.stats.totalDraws,
            totalEntries: queuedData.data.stats.totalEntries + activeData.data.stats.totalEntries,
            totalPrizeValue: queuedData.data.stats.totalPrizeValue + activeData.data.stats.totalPrizeValue,
            // Revenue is filter-wide per response, so the two must be SUMMED —
            // same as every other stat on this merge path.
            totalRevenue: (queuedData.data.stats.totalRevenue ?? 0) + (activeData.data.stats.totalRevenue ?? 0),
            drawsWithWinners,
            drawsWithoutWinners,
            winnerSelectionRate: totalWithOutcome > 0 ? Math.round((drawsWithWinners / totalWithOutcome) * 100) : 0,
          });
        } else {
          const response = await fetch(`${HISTORY_ENDPOINT}?${baseParams(filters.status)}`);
          if (!response.ok) {
            setErrorStatus(response.status);
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          const data: UpcomingDrawsResponse = await response.json();
          if (!data.success) throw new Error("Failed to fetch draws");

          setDraws(data.data.draws);
          setPagination(data.data.pagination);
          setStats(data.data.stats);
        }
      } catch (err) {
        console.error("Error fetching draws:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch draws");
      } finally {
        setIsLoading(false);
      }
    },
    [filters.status, debouncedSearch, pagination.limit]
  );

  useEffect(() => {
    fetchDraws();
  }, [fetchDraws]);

  const handlePageChange = (newPage: number) => {
    fetchDraws(newPage);
  };

  // Convert UpcomingDraw to MajorDrawData format for the modal
  const convertToMajorDrawData = (draw: UpcomingDraw) => {
    return {
      _id: draw._id,
      name: draw.name,
      description: draw.description,
      resultUrl: draw.resultUrl ?? "",
      watchUrl: draw.watchUrl ?? "",
      prize: draw.prize,
      drawDate: draw.drawDate instanceof Date ? draw.drawDate.toISOString() : draw.drawDate,
      activationDate: draw.activationDate instanceof Date ? draw.activationDate.toISOString() : draw.activationDate,
      freezeEntriesAt: draw.freezeEntriesAt instanceof Date ? draw.freezeEntriesAt.toISOString() : draw.freezeEntriesAt,
      status: draw.status,
      configurationLocked: draw.configurationLocked,
    };
  };

  /**
   * THE single edit gate. Every entry point — inspector primary, row action and
   * (on mobile) the sheet — routes through here, so a locked draw can never
   * reach the form from any of them.
   */
  const openDrawEditor = useCallback((draw: UpcomingDraw) => {
    if (draw.configurationLocked) {
      setLockedNoticeDraw(draw);
      return;
    }
    setSelectedDraw(draw);
    setIsEditModalOpen(true);
  }, []);

  // Handle save draw - accepts MajorDrawData format from modal
  const handleSaveDraw = async (data: Partial<MajorDrawData>) => {
    if (!selectedDraw) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/major-draw/update?id=${selectedDraw._id}`, {
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
      setIsEditModalOpen(false);
      setSelectedDraw(null);

      showToast({
        type: "success",
        title: "Draw Updated Successfully!",
        message: `${selectedDraw.name} has been updated and changes are now live.`,
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
      setIsSubmitting(false);
    }
  };

  // Viewer's local timezone, matching this page's long-standing behaviour
  // (Draw Results uses AEST — the two differ deliberately and always have).
  const formatDate = (date: Date | string) => formatDateInLocal(new Date(date), "dd MMM yyyy, h:mm a");

  // ── Presentation mapping ────────────────────────────────────────────────
  const rows: DrawRow[] = useMemo(
    () =>
      draws.map((draw) => {
        const isLive = draw.status === "active";
        return {
          id: draw._id,
          name: draw.name,
          kind: isLive ? "Live now" : "Major draw",
          date: formatDate(draw.drawDate),
          status: draw.status,
          entries: draw.totalEntries,
          entriesLabel: draw.totalEntries.toLocaleString(),
          revenue: draw.revenue ?? 0,
          revenueLabel: currency(draw.revenue ?? 0),
          revenuePerEntryLabel:
            draw.revenuePerEntry == null ? "—" : `${currencyPrecise(draw.revenuePerEntry)} / entry`,
          prizeValueLabel: draw.prize?.value ? currency(draw.prize.value) : "TBC",
          // Column 6 on Upcoming is the GATE, not a winner.
          trailing: isLive ? "Entries open" : "Not activated",
          trailingSub: draw.configurationLocked
            ? "config locked"
            : isLive
              ? `freezes ${formatDate(draw.freezeEntriesAt)}`
              : `activates ${formatDate(draw.activationDate)}`,
          locked: !!draw.configurationLocked,
          hasWinner: false,
        };
      }),
    [draws]
  );

  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;
  const selectedUpcoming = draws.find((draw) => draw._id === selectedRowId) ?? null;
  const searchTerm = filters.search.trim();

  /** Upcoming groups by Live now / Scheduled (Results groups by year). */
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

    const statusOf = new Map(draws.map((d) => [d._id, d.status]));
    const live = rows.filter((row) => statusOf.get(row.id) === "active");
    const scheduled = rows.filter((row) => statusOf.get(row.id) !== "active");
    const out: DrawGroup[] = [];

    if (live.length > 0) {
      const freezeSub = live[0]?.trailingSub ?? "";
      out.push({
        label: "Live now",
        meta: `${live.length} ${live.length === 1 ? "draw" : "draws"} · entries open · ${freezeSub}`,
        rows: live,
      });
    }
    if (scheduled.length > 0) {
      const missingPrize = scheduled.filter((row) => row.prizeValueLabel === "TBC").length;
      const parts = [`${scheduled.length} ${scheduled.length === 1 ? "draw" : "draws"}`];
      if (missingPrize > 0) parts.push(`${missingPrize} prize${missingPrize === 1 ? "" : "s"} still to set`);
      out.push({ label: "Scheduled", meta: parts.join(" · "), rows: scheduled });
    }
    return out;
  }, [rows, draws, searchTerm]);

  const dataState = isLoading ? "loading" : error ? "error" : rows.length === 0 ? "empty" : "ready";

  const emptyTitle = searchTerm ? `No draws match “${searchTerm}”` : "No draws match these filters";
  const emptyBody = searchTerm
    ? "Nothing scheduled matches that name or description. Clear the search to see every scheduled draw."
    : "Nothing is queued under the status you picked. Clear the filters to see all scheduled draws.";

  const clearFilters = () => {
    setFilters({ status: COMBINED_STATUS, search: "" });
    setOpenFilterKey(null);
  };

  const onPickFilter = (key: string, label: string) => {
    setOpenFilterKey(null);
    if (key === "status") setFilters((prev) => ({ ...prev, status: valueFor(STATUS_OPTIONS, label) }));
  };

  const drawById = (id: string) => draws.find((draw) => draw._id === id);

  return (
    <>
      <DrawsListPage
        variant="upcoming"
        kpis={[
          { label: "Scheduled draws", value: stats.totalDraws.toLocaleString() },
          { label: "Entries in flight", value: stats.totalEntries.toLocaleString() },
          { label: "Revenue in flight", value: compactCurrency(stats.totalRevenue ?? 0) },
          { label: "Prize value queued", value: compactCurrency(stats.totalPrizeValue) },
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
        ]}
        openFilterKey={openFilterKey}
        onToggleFilter={setOpenFilterKey}
        onPickFilter={onPickFilter}
        // Task 7: the create flow already existed on Overview's quick actions —
        // this is a second mount point, not a new capability. Overview keeps its.
        actions={
          canEditMajor
            ? [{ label: "New major draw", icon: Plus, onClick: () => setIsCreateModalOpen(true) }]
            : []
        }
        groups={groups}
        dataState={dataState}
        selectedRow={selectedRow}
        onSelectRow={(row) => setSelectedRowId(row?.id ?? null)}
        onClearFilters={clearFilters}
        onRetry={() => fetchDraws(pagination.currentPage)}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        errorEndpoint={`GET ${HISTORY_ENDPOINT}${errorStatus ? ` · ${errorStatus}` : ""}`}
        verificationUrl={selectedUpcoming?.resultUrl ?? null}
        // Both the primary and the secondary go through the same lock gate.
        onInspectorPrimary={(row) => {
          const draw = drawById(row.id);
          if (draw) openDrawEditor(draw);
        }}
        onEditDraw={(row) => {
          const draw = drawById(row.id);
          if (draw) openDrawEditor(draw);
        }}
        onExport={(row) => {
          // Upcoming draws have no participants export of their own; the pool
          // export lives on Major Draw, so send the admin there rather than
          // rendering a button that does nothing.
          showToast({
            type: "info",
            title: "Export lives on Major Draw",
            message: `Open the Major Draw tab to export the entry pool for ${row.name}.`,
            duration: 6000,
          });
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
                Showing page {pagination.currentPage} of {pagination.totalPages}
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

      {/* Create Modal — same component Overview's quick actions mounts. */}
      <AdminMajorDrawModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          void fetchDraws(pagination.currentPage);
        }}
      />

      <DrawLockedModal
        isOpen={lockedNoticeDraw !== null}
        onClose={() => setLockedNoticeDraw(null)}
        drawName={lockedNoticeDraw?.name ?? ""}
      />
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
