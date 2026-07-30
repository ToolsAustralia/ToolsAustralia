"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Download, Trophy, AlertCircle } from "lucide-react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
// Full catalog import (not usePrizeCatalog): this admin card renders `detailedDescription`,
// a deep field deliberately excluded from the client prize-summaries split. Admin-chunk only —
// never reachable from the marketing/landing graph, so the heavy module is acceptable here.
import { DEFAULT_PRIZE_SLUG, getPrizeBySlug } from "@/config/prizes";
import { formatDateInAEST } from "@/utils/common/timezone";
import { useToast } from "@/components/ui/Toast";
import {
  WinnerSelectionModal,
  WinnerEditModal,
  ParticipantsModal,
  ExportModal,
  type WinnerSelectionData,
} from "@/components/modals/draws";
import { usePermissions } from "@/hooks/usePermissions";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import {
  DrawsPageShell,
  DrawStatusRibbon,
  DrawGatesCard,
  EntryPoolCard,
  type RibbonStat,
  type DrawGate,
  type TopEntrant,
} from "@/components/admin/draws";

/** The five business rules, verbatim from the design. */
const DRAW_RULES = [
  "Export is available at any status except cancelled.",
  "Entries freeze automatically 30 minutes before the draw.",
  "Winner can only be recorded once the draw is frozen or completed.",
  "Configuration locks the moment entries freeze.",
  "Renewals paid between 8:00 PM and midnight route into the next month's draw.",
];

const currency = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(amount);
const currencyPrecise = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(amount);

const fmt = (date: Date | string | null | undefined, pattern = "d MMM · h:mm a") =>
  date ? formatDateInAEST(new Date(date), pattern) : null;

/**
 * Compact "time until draw" for the ribbon stat.
 *
 * NOT `formatCountdown` — that never rolls hours into days, so a draw four weeks
 * out reads "669 hours 51 minutes", which wraps to two lines and buries the one
 * number an admin actually wants. It is also shared with customer-facing
 * countdowns where the hours-only form is deliberate, so it is left alone and
 * the compact form lives here.
 */
function formatTimeUntilDraw(ms: number): string {
  if (ms <= 0) return "Completed";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function MajorDrawManagement() {
  const { has } = usePermissions();
  const canEditMajor = has("majorDraw.edit");
  const canSelectMajorWinner = has("majorDraw.selectWinner");
  const { showToast } = useToast();
  const { openUserModal } = useAdminUserModal();
  const { data: currentMajorDraw, isLoading, error, refetch } = useCurrentMajorDraw();
  const activePrize = getPrizeBySlug(DEFAULT_PRIZE_SLUG);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isEditWinnerModalOpen, setIsEditWinnerModalOpen] = useState(false);
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
    drawResultUrl?: string | null;
  } | null>(null);

  // Supporting reads for the ribbon / gates / pool.
  const [drawRevenue, setDrawRevenue] = useState<{ revenue: number; perEntry: number | null } | null>(null);
  const [nextDrawActivation, setNextDrawActivation] = useState<string | null>(null);
  const [topEntrants, setTopEntrants] = useState<TopEntrant[]>([]);
  const [isLoadingPool, setIsLoadingPool] = useState(true);

  const drawId = currentMajorDraw?._id;

  // Fetch current winner from Winner model
  useEffect(() => {
    if (!drawId) return;

    const fetchWinner = async () => {
      try {
        const response = await fetch(`/api/admin/major-draw/select-winner?majorDrawId=${drawId}`);
        const data = await response.json();

        if (!data.hasWinner || !data.winner) {
          setCurrentWinner(null);
          return;
        }

        const base = {
          userId: data.winner.userId.toString(),
          entryNumber: data.winner.entryNumber || 0,
          selectedDate: new Date(data.winner.selectedDate),
          selectionMethod: data.winner.selectionMethod,
          imageUrl: data.winner.imageUrl,
        };

        // Enrich with the Winner document (testimony, prize, result link) when we
        // can find it; fall back to the basic record rather than showing nothing.
        try {
          const allWinnersResponse = await fetch(`/api/winners/all?drawType=major&limit=100`);
          const allWinnersData = allWinnersResponse.ok ? await allWinnersResponse.json() : null;
          const winnerForDraw = allWinnersData?.success
            ? allWinnersData.winners?.find(
                (w: { drawId: string; drawType: string }) =>
                  w.drawId === drawId?.toString() && w.drawType === "major"
              )
            : null;

          if (!winnerForDraw) {
            setCurrentWinner({
              ...base,
              testimony: data.winner.testimony,
              selectedPrize: data.winner.selectedPrize || data.winner.selectedPrizeSlug,
              drawResultUrl: data.winner.drawResultUrl ?? null,
            });
            return;
          }

          const detailsResponse = await fetch(`/api/admin/winners/${winnerForDraw.id}`);
          const details = detailsResponse.ok ? await detailsResponse.json() : null;

          if (details?.success && details.winner) {
            setCurrentWinner({
              ...base,
              testimony: details.winner.testimony,
              selectedPrize: details.winner.selectedPrize || details.winner.selectedPrizeSlug,
              winnerId: details.winner.id,
              winnerName: `${details.winner.winnerFirstName} ${details.winner.winnerLastName}`.trim(),
              drawResultUrl: details.winner.drawResultUrl ?? data.winner.drawResultUrl ?? null,
            });
          } else {
            setCurrentWinner({
              ...base,
              testimony: winnerForDraw.testimony,
              selectedPrize: winnerForDraw.selectedPrize || winnerForDraw.selectedPrizeSlug,
              winnerId: winnerForDraw.id,
              drawResultUrl: winnerForDraw.drawResultUrl ?? data.winner.drawResultUrl ?? null,
            });
          }
        } catch (detailError) {
          console.error("Error fetching winner details:", detailError);
          setCurrentWinner({
            ...base,
            testimony: data.winner.testimony,
            selectedPrize: data.winner.selectedPrize || data.winner.selectedPrizeSlug,
            drawResultUrl: data.winner.drawResultUrl ?? null,
          });
        }
      } catch (err) {
        console.error("Error fetching winner:", err);
        setCurrentWinner(null);
      }
    };

    void fetchWinner();
  }, [drawId, refetch]);

  /**
   * Revenue for THIS draw + the next queued draw's activation date, both read
   * from the existing history endpoint — no new route.
   */
  useEffect(() => {
    if (!drawId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [selfRes, nextRes] = await Promise.all([
          fetch(`/api/admin/major-draw/history?limit=100`),
          fetch(`/api/admin/major-draw/history?status=queued&sortBy=drawDate&sortOrder=asc&limit=1`),
        ]);

        if (selfRes.ok) {
          const selfData = await selfRes.json();
          const match = selfData?.data?.draws?.find((d: { _id: string }) => d._id === drawId);
          if (!cancelled && match) {
            setDrawRevenue({ revenue: match.revenue ?? 0, perEntry: match.revenuePerEntry ?? null });
          }
        }

        if (nextRes.ok) {
          const nextData = await nextRes.json();
          const next = nextData?.data?.draws?.[0];
          if (!cancelled) setNextDrawActivation(next?.activationDate ?? null);
        }
      } catch (err) {
        // Supporting figures only — never block the page on them.
        console.error("Error loading draw revenue / next draw:", err);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [drawId]);

  /**
   * Top three entrants. Correct only because the participants route now sorts
   * BEFORE paginating (docs/admin/api.md, 2026-07-30) — previously `?limit=3`
   * returned the first three in insertion order.
   */
  useEffect(() => {
    if (!drawId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingPool(true);
      try {
        const res = await fetch(`/api/admin/major-draw/participants?majorDrawId=${drawId}&limit=3`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setTopEntrants(
          (data?.data?.participants ?? []).map(
            (p: { userId: string; firstName: string; lastName: string; totalEntries: number }) => ({
              userId: p.userId,
              name: `${p.firstName} ${p.lastName}`.trim() || "Unnamed entrant",
              entries: p.totalEntries,
            })
          )
        );
      } catch (err) {
        console.error("Error loading top entrants:", err);
        if (!cancelled) setTopEntrants([]);
      } finally {
        if (!cancelled) setIsLoadingPool(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [drawId]);

  /** Handle winner selection from modal */
  const handleWinnerSelected = async (winnerData: WinnerSelectionData) => {
    if (winnerData.drawType !== "major" || !currentMajorDraw) return;

    setIsSubmitting(true);
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

      if (winnerData.imageUrl && typeof winnerData.imageUrl === "string" && winnerData.imageUrl.trim() !== "") {
        requestBody.imageUrl = winnerData.imageUrl.trim();
      }
      if (winnerData.testimony !== undefined) requestBody.testimony = winnerData.testimony || undefined;
      if (winnerData.selectedPrize !== undefined) requestBody.selectedPrize = winnerData.selectedPrize;
      if (winnerData.drawResultUrl !== undefined) requestBody.drawResultUrl = winnerData.drawResultUrl;

      const response = await fetch("/api/admin/major-draw/select-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to select winner");

      showToast({
        type: "success",
        title: "Winner Recorded Successfully!",
        message: `Winner has been recorded for ${currentMajorDraw.name}`,
        duration: 5000,
      });

      setIsWinnerModalOpen(false);
      refetch();
    } catch (err) {
      console.error("Winner selection error:", err);
      showToast({
        type: "error",
        title: "Failed to Record Winner",
        message: err instanceof Error ? err.message : "Failed to record winner. Please try again.",
        duration: 7000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Derived display values ──────────────────────────────────────────────
  const majorDraw = currentMajorDraw;

  const isFrozen = majorDraw?.status === "frozen" || majorDraw?.status === "completed";
  const canExport = majorDraw?.status !== "cancelled";
  const canSelectWinner = (majorDraw?.status === "frozen" || majorDraw?.status === "completed") && !currentWinner;

  const timeUntilDraw = majorDraw?.drawDate ? Math.max(0, new Date(majorDraw.drawDate).getTime() - Date.now()) : 0;

  const ribbonStats: RibbonStat[] = useMemo(() => {
    const participants = majorDraw?.totalParticipants ?? 0;
    const entries = majorDraw?.totalEntries ?? 0;
    return [
      {
        label: "Participants",
        value: participants.toLocaleString(),
        sub: participants > 0 ? `${(entries / participants).toFixed(1)} avg entries` : undefined,
      },
      // No sub-line: the design shows a 24-hour delta, but no such figure exists
      // in the data and inventing one would put a fabricated number on an ops screen.
      { label: "Entries", value: entries.toLocaleString() },
      {
        label: "Draw revenue",
        value: drawRevenue ? currency(drawRevenue.revenue) : "—",
        sub: drawRevenue?.perEntry != null ? `${currencyPrecise(drawRevenue.perEntry)} per entry` : undefined,
        tone: "positive",
      },
      {
        label: "Draws in",
        value: formatTimeUntilDraw(timeUntilDraw),
        sub: majorDraw?.freezeEntriesAt ? `freezes ${fmt(majorDraw.freezeEntriesAt, "h:mm a")}` : undefined,
        tone: "urgent",
      },
    ];
  }, [majorDraw, drawRevenue, timeUntilDraw]);

  /** Activation → draw as a 0–100 bar. */
  const progressPercent = useMemo(() => {
    if (!majorDraw?.activationDate || !majorDraw?.drawDate) return 0;
    const start = new Date(majorDraw.activationDate).getTime();
    const end = new Date(majorDraw.drawDate).getTime();
    if (end <= start) return 100;
    return ((Date.now() - start) / (end - start)) * 100;
  }, [majorDraw?.activationDate, majorDraw?.drawDate]);

  const gates: DrawGate[] = useMemo(
    () => [
      {
        label: "Entries open",
        time: fmt(majorDraw?.activationDate),
        note: "Draw opened; renewals routed into this pool.",
        current: majorDraw?.status === "active",
      },
      {
        label: "Entries freeze",
        time: fmt(majorDraw?.freezeEntriesAt),
        note: "Purchases route to the next draw. Config locks automatically.",
        current: majorDraw?.status === "frozen",
      },
      {
        label: "Draw live on Facebook",
        time: fmt(majorDraw?.drawDate),
        note: "Export the locked entry list to randomdraws.com.au.",
        current: majorDraw?.status === "completed",
      },
      {
        label: "Next draw opens",
        time: fmt(nextDrawActivation),
        note: nextDrawActivation
          ? "Gap window ends; the next draw opens for entries."
          : "No draw is queued yet — schedule one before this draw closes.",
      },
    ],
    [majorDraw, nextDrawActivation]
  );

  // ── States ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DrawsPageShell>
        <div className="admin-draws-skeleton h-[190px] rounded-[14px]" aria-busy="true" />
        <div className="grid grid-cols-[var(--m-majorCols)] gap-[var(--m-gap)]">
          <div className="admin-draws-skeleton h-[220px] rounded-[11px]" />
          <div className="admin-draws-skeleton h-[220px] rounded-[11px]" />
        </div>
      </DrawsPageShell>
    );
  }

  if (error || !majorDraw) {
    return (
      <DrawsPageShell>
        <div className="flex items-start gap-[10px] rounded-[var(--m-radius)] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-[14px] py-[12px]">
          <AlertCircle className="mt-[1px] h-[18px] w-[18px] shrink-0 text-[var(--danger)]" aria-hidden />
          <div>
            <p className="font-poppins text-[14px] font-bold text-[var(--danger)]">Couldn&apos;t load the major draw</p>
            <p className="mt-[3px] text-[12.5px] leading-[1.6] text-[var(--text2)]">
              Nothing has changed — retrying is safe.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-[10px] flex h-[var(--m-btn-h)] items-center rounded-[9px] bg-[var(--accent)] px-[15px] text-[12.5px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </div>
      </DrawsPageShell>
    );
  }

  const statusWord =
    majorDraw.status === "active"
      ? "ENTRIES OPEN"
      : majorDraw.status === "frozen"
        ? "ENTRIES FROZEN"
        : majorDraw.status === "completed"
          ? "DRAW COMPLETE"
          : majorDraw.status === "queued"
            ? "QUEUED"
            : "CANCELLED";
  const statusEyebrow = `${statusWord} · ${majorDraw.configurationLocked ? "CONFIG LOCKED" : "CONFIG UNLOCKED"}`;

  // 38px is the design's ribbon-specific button height, but ONLY above the
  // breakpoint — these are tappable, so below it they take --m-btn-h (44px) like
  // every other control. A bare h-[38px] here would be the one sub-44px target
  // on the page.
  const showMobileActionBar =
    (canSelectWinner && canSelectMajorWinner) || Boolean(currentWinner?.winnerId && canEditMajor);

  const ribbonButton =
    "flex h-[var(--m-btn-h)] draws:h-[38px] w-[var(--m-ribbonBtnW)] items-center justify-center gap-[7px] rounded-[9px] px-[14px] text-[12.5px] font-semibold";

  return (
    <DrawsPageShell>
      <DrawStatusRibbon
        eyebrow={statusEyebrow}
        title={majorDraw.name || "Untitled draw"}
        subtitle={`Draws ${fmt(majorDraw.drawDate, "d MMM yyyy · h:mm a") ?? "date TBC"} · entries freeze ${
          fmt(majorDraw.freezeEntriesAt, "h:mm a") ?? "TBC"
        } AEST`}
        stats={ribbonStats}
        progressPercent={progressPercent}
        // Mobile: Export is a quiet icon in the top-right. It is a secondary
        // action, and the labelled buttons all live in the pinned bottom bar.
        utility={
          canExport ? (
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              aria-label="Export entry pool"
              title="Export pool"
              className="flex h-[var(--m-icon)] w-[var(--m-icon)] items-center justify-center rounded-[9px] border border-[var(--ribbon-ghost-line)] text-white hover:bg-white/10"
            >
              <Download className="h-[17px] w-[17px]" />
            </button>
          ) : null
        }
        actions={
          <>
            {canExport && (
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className={`${ribbonButton} border border-[var(--ribbon-ghost-line)] bg-transparent text-white hover:bg-white/10`}
              >
                <Download className="h-[15px] w-[15px]" />
                Export pool
              </button>
            )}
            {canSelectWinner && canSelectMajorWinner && (
              <button
                type="button"
                onClick={() => setIsWinnerModalOpen(true)}
                disabled={isSubmitting}
                className={`${ribbonButton} bg-[#ee0000] text-white hover:opacity-90 disabled:opacity-60`}
              >
                <Trophy className="h-[15px] w-[15px]" />
                {isSubmitting ? "Recording…" : "Record winner"}
              </button>
            )}
            {currentWinner?.winnerId && canEditMajor && (
              <button
                type="button"
                onClick={() => setIsEditWinnerModalOpen(true)}
                className={`${ribbonButton} border border-[var(--ribbon-ghost-line)] bg-transparent text-white hover:bg-white/10`}
              >
                Edit winner
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-[var(--m-majorCols)] items-start gap-[var(--m-gap)]">
        {/* Prize — READ-ONLY on purpose. It renders the STATIC config prize
            (src/config/prizes), while MajorDraw.prize in the DB is @deprecated.
            An "Edit prize" button here would edit a DIFFERENT field than the one
            shown, so it is deliberately absent. Do not add it back without first
            resolving which prize is canonical. */}
        {activePrize && (
          <section className="rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-[14px] shadow-[var(--shadow)]">
            <h3 className="font-poppins text-[15px] font-bold text-[var(--text)]">This month&apos;s prize</h3>
            <div className="mt-[12px] flex flex-col gap-[12px] draws:flex-row">
              <div className="h-[96px] w-[96px] shrink-0 rounded-[9px] bg-[var(--panel2)]" aria-hidden />
              <div className="min-w-0">
                <div className="font-poppins text-[17px] font-bold leading-[1.25] text-[var(--text)]">
                  {activePrize.label}
                </div>
                {activePrize.detailedDescription && (
                  <p className="mt-[5px] text-[13px] leading-[1.6] text-[var(--text2)]">
                    {activePrize.detailedDescription}
                  </p>
                )}
                <dl className="mt-[12px] grid grid-cols-2 gap-[8px]">
                  <div className="rounded-[9px] border border-[var(--line)] bg-[var(--panel2)] px-[10px] py-[8px]">
                    <dt className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">
                      Prize value
                    </dt>
                    <dd data-figure className="mt-[2px] font-poppins text-[15px] font-bold text-[var(--ok)]">
                      {activePrize.prizeValueLabel ?? "See prize options"}
                    </dd>
                  </div>
                  <div className="rounded-[9px] border border-[var(--line)] bg-[var(--panel2)] px-[10px] py-[8px]">
                    <dt className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">Status</dt>
                    <dd className="mt-[2px] font-poppins text-[15px] font-bold text-[var(--text)]">
                      {isFrozen ? "Entries frozen" : "Entries active"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        )}

        <DrawGatesCard gates={gates} />
      </div>

      <div className="grid grid-cols-[var(--m-majorCols)] items-start gap-[var(--m-gap)]">
        <EntryPoolCard
          entrants={topEntrants}
          isLoading={isLoadingPool}
          onViewParticipants={() => setIsParticipantsModalOpen(true)}
          onOpenEntrant={openUserModal}
        />

        <section className="rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-[14px] shadow-[var(--shadow)]">
          <h3 className="font-poppins text-[15px] font-bold text-[var(--text)]">Rules</h3>
          <ul className="mt-[10px] list-outside list-disc space-y-[5px] pl-[16px]">
            {DRAW_RULES.map((rule) => (
              <li key={rule} className="text-[12.5px] leading-[1.7] text-[var(--text2)]">
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Mobile bottom action bar. The ribbon's actions scroll away on a phone,
          and on draw night the two that matter must stay reachable. Hidden at
          `draws:` where the ribbon buttons are always visible.
          `pb-[env(safe-area-inset-bottom)]` keeps it clear of the iOS home bar. */}
      {/* Export is NOT repeated here — it is the ribbon's top-right icon on
          mobile. This bar carries only the actions that warrant a labelled,
          always-reachable target on draw night. Rendered only when it has
          something in it, or the border + padding leave a stray strip. */}
      {showMobileActionBar && (
      <div className="sticky bottom-0 -mx-[var(--m-pad)] -mb-[var(--m-pad)] mt-[var(--m-gap)] flex items-center gap-[8px] border-t border-[var(--line)] bg-[var(--panel)] px-[var(--m-pad)] py-[8px] pb-[calc(8px+env(safe-area-inset-bottom))] draws:hidden">
        {canSelectWinner && canSelectMajorWinner && (
          <button
            type="button"
            onClick={() => setIsWinnerModalOpen(true)}
            disabled={isSubmitting}
            className="flex h-[var(--m-btn-h)] flex-1 items-center justify-center gap-[7px] rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-white disabled:opacity-60"
          >
            <Trophy className="h-[16px] w-[16px]" />
            {isSubmitting ? "Recording…" : "Record winner"}
          </button>
        )}
        {currentWinner?.winnerId && canEditMajor && (
          <button
            type="button"
            onClick={() => setIsEditWinnerModalOpen(true)}
            className="flex h-[var(--m-btn-h)] flex-1 items-center justify-center rounded-[9px] border border-[var(--line)] bg-[var(--panel)] text-[13px] font-semibold text-[var(--text)]"
          >
            Edit winner
          </button>
        )}
      </div>
      )}

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
                testimony: currentWinner.testimony ?? undefined,
                selectedPrize: currentWinner.selectedPrize ?? undefined,
                drawResultUrl: currentWinner.drawResultUrl ?? undefined,
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
          currentDrawResultUrl={currentWinner.drawResultUrl}
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

      {/* Export pool. The old page had two bare CSV/Excel buttons; the design
          routes both through the format-picker modal, which already owns the
          same /api/admin/major-draw/export download. */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        majorDrawId={majorDraw._id || ""}
        majorDrawName={majorDraw.name || ""}
        totalParticipants={majorDraw.totalParticipants ?? majorDraw.totalEntries ?? 0}
      />
    </DrawsPageShell>
  );
}
