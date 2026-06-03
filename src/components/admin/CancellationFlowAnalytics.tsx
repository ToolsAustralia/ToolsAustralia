"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import {
  BarChart3,
  HeartHandshake,
  Percent,
  ShieldCheck,
  Clock,
  MessageSquare,
} from "lucide-react";

import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import CancellationReasonUsersModal from "@/components/admin/CancellationReasonUsersModal";
import { DateRange } from "@/components/admin/DateRangeToggle";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import { useCancellationFlowAnalytics } from "@/hooks/queries/admin/useCancellationFlowAnalytics";
import {
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
} from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

// Hardcoded (NOT imported from @/models/CancellationFlowEvent): this is a
// "use client" component and that module is a Mongoose model — runtime-importing
// it in client code crashes (mongoose is serverExternalPackages). Keep in sync
// with CANCELLATION_REASONS / OFFER_TYPES in src/models/CancellationFlowEvent.ts.
const CANCELLATION_REASONS = [
  "too_expensive",
  "prefer_cheaper",
  "dont_use_benefits",
  "too_many_messages",
  "joined_for_giveaway",
  "havent_won",
  "other",
] as const;
const OFFER_TYPES = [
  "pause_30d",
  "discount_50_2mo",
  "tier_downgrade",
  "unsubscribe_marketing",
  "bonus_entries_100",
] as const;

const REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "Too expensive",
  prefer_cheaper: "Prefer a cheaper plan",
  dont_use_benefits: "Don’t use the benefits",
  too_many_messages: "Too many messages",
  joined_for_giveaway: "Joined for a giveaway",
  havent_won: "Haven’t won",
  other: "Other",
};
const OFFER_LABELS: Record<OfferType, string> = {
  pause_30d: "Pause 30 days",
  discount_50_2mo: "50% off for 2 months",
  tier_downgrade: "Tier downgrade",
  unsubscribe_marketing: "Unsubscribe marketing",
  bonus_entries_100: "100 bonus entries",
};

const OUTCOME_CHIP: Record<"saved" | "cancelled" | "in_progress", string> = {
  saved:
    "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50",
  cancelled:
    "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200/80 dark:border-red-800/50",
  in_progress:
    "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border border-gray-200/80 dark:border-neutral-600",
};

function todayAEST(): string {
  return formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
}
function yesterdayAEST(): string {
  return formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
}

export default function CancellationFlowAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();

  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [reasonModalReason, setReasonModalReason] = useState<CancellationReason | null>(null);

  const { data: drawDates } = useCurrentAndLastDrawDates();
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Sync filter state with URL params (same pattern as Overview / Promo Analytics).
  useEffect(() => {
    const urlRange = (searchParams.get("dateRange") as DateRange) || "today";
    let urlStart = searchParams.get("startDate") || "";
    let urlEnd = searchParams.get("endDate") || "";

    if ((urlRange === "today" || urlRange === "yesterday") && (!urlStart || !urlEnd)) {
      const d = urlRange === "yesterday" ? yesterdayAEST() : todayAEST();
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", d);
      params.set("endDate", d);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      urlStart = d;
      urlEnd = d;
    }
    if (urlRange === "all-time" && (!urlStart || !urlEnd)) {
      const launch = formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
      const t = todayAEST();
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", launch);
      params.set("endDate", t);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      urlStart = launch;
      urlEnd = t;
    }

    setDateRange(urlRange);
    setStartDate(urlStart);
    setEndDate(urlEnd);
  }, [searchParams, pathname, router]);

  // Hydrate draw-based ranges once drawDates loads.
  useEffect(() => {
    if (!drawDates) return;
    if (dateRange === "current-draw" && drawDates.currentDraw && (!startDate || !endDate)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", drawDates.currentDraw.startDate);
      params.set("endDate", drawDates.currentDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setStartDate(drawDates.currentDraw.startDate);
      setEndDate(drawDates.currentDraw.endDate);
    } else if (dateRange === "last-draw" && drawDates.lastDraw && (!startDate || !endDate)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", drawDates.lastDraw.startDate);
      params.set("endDate", drawDates.lastDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setStartDate(drawDates.lastDraw.startDate);
      setEndDate(drawDates.lastDraw.endDate);
    }
  }, [dateRange, drawDates, startDate, endDate, searchParams, pathname, router]);

  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    let finalStart = start;
    let finalEnd = end;
    if (range === "today") {
      finalStart = todayAEST();
      finalEnd = finalStart;
    } else if (range === "yesterday") {
      finalStart = yesterdayAEST();
      finalEnd = finalStart;
    } else if (range === "current-draw" && drawDates?.currentDraw) {
      finalStart = drawDates.currentDraw.startDate;
      finalEnd = drawDates.currentDraw.endDate;
    } else if (range === "last-draw" && drawDates?.lastDraw) {
      finalStart = drawDates.lastDraw.startDate;
      finalEnd = drawDates.lastDraw.endDate;
    } else if (range === "all-time") {
      finalStart = formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = todayAEST();
    }

    setDateRange(range);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    } else {
      setStartDate("");
      setEndDate("");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("dateRange", range);
    if (finalStart && finalEnd) {
      params.set("startDate", finalStart);
      params.set("endDate", finalEnd);
    } else {
      params.delete("startDate");
      params.delete("endDate");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const filter = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [startDate, endDate]
  );
  const { data, isLoading, isError } = useCancellationFlowAnalytics(filter);

  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
    }
    if (dateRange === "all-time") return "All time";
    if (dateRange === "current-draw") return "Current draw";
    if (dateRange === "last-draw") return "Last draw";
    return null;
  }, [dateRange, startDate, endDate]);

  const dateRangeToggle = (
    <DateRangeDropdown
      selectedRange={dateRange}
      onRangeChange={(range) => updateDateFilter(range)}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      displayDate={displayDate || undefined}
    />
  );

  /** Retained share over matured (retained + churned); 0 when none matured. */
  const retainedPct = (retained: number, churned: number): string => {
    const matured = retained + churned;
    if (matured === 0) return "—";
    return `${Math.round((retained / matured) * 1000) / 10}%`;
  };

  const funnelSteps = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Reached offer", value: data.funnel.reachedOffer },
      { label: "Accepted (saved)", value: data.funnel.accepted },
      { label: "Cancelled", value: data.funnel.cancelled },
      { label: "Abandoned (>1h)", value: data.funnel.abandoned },
    ];
  }, [data]);
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + date filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Cancellation Flow</h2>
        {isLgUp ? <div className="flex items-center gap-2">{dateRangeToggle}</div> : null}
      </div>
      {!isLgUp && slotEl
        ? createPortal(
            <AdminMobileLayoutDateRangeShell>{dateRangeToggle}</AdminMobileLayoutDateRangeShell>,
            slotEl
          )
        : null}
      {!isLgUp && !slotEl ? (
        <div className="lg:hidden">
          <AdminMobileLayoutDateRangeShell>{dateRangeToggle}</AdminMobileLayoutDateRangeShell>
        </div>
      ) : null}

      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(start, end) => {
          updateDateFilter("custom", start, end);
          setIsCustomDateModalOpen(false);
        }}
        currentStartDate={startDate}
        currentEndDate={endDate}
        majorDraws={majorDraws}
      />

      <CancellationReasonUsersModal
        isOpen={reasonModalReason !== null}
        onClose={() => setReasonModalReason(null)}
        reason={reasonModalReason}
        startDate={startDate || undefined}
        endDate={endDate || undefined}
      />

      {isError && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg p-4 text-red-700 dark:text-red-300">
          Failed to load cancellation-flow analytics.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          title="Triggered"
          value={isLoading ? "—" : (data?.triggered ?? 0).toLocaleString()}
          icon={BarChart3}
          color="blue"
        />
        <MetricCard
          title="Save rate"
          value={isLoading ? "—" : `${data?.saveRatePct ?? 0}%`}
          subtitle="accepted ÷ (accepted + cancelled + abandoned)"
          icon={Percent}
          color="emerald"
        />
        <MetricCard
          title="Saved"
          value={isLoading ? "—" : (data?.funnel.accepted ?? 0).toLocaleString()}
          subtitle={
            data
              ? `${data.funnel.cancelled} cancelled · ${data.funnel.abandoned} abandoned`
              : undefined
          }
          icon={HeartHandshake}
          color="purple"
        />
      </div>

      {/* Funnel */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700">
          Funnel
        </h3>
        <div className="p-4 space-y-2">
          {isLoading || !data ? (
            <div className="p-4 text-center text-sm text-gray-500 dark:text-neutral-400">Loading…</div>
          ) : (
            funnelSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="w-44 sm:w-56 shrink-0 text-sm text-gray-700 dark:text-neutral-300">
                  {step.label}
                </div>
                <div className="h-5 flex-1 rounded bg-gray-100 dark:bg-neutral-800">
                  <div
                    className="h-5 rounded bg-red-500/80 dark:bg-red-500/70"
                    style={{ width: `${Math.round((step.value / funnelMax) * 100)}%` }}
                  />
                </div>
                <div className="w-12 shrink-0 text-right text-sm font-mono tabular-nums font-medium text-gray-900 dark:text-white">
                  {step.value}
                </div>
              </div>
            ))
          )}
          {data && data.pastDueExcludedFromOfferConversion > 0 ? (
            <p className="pt-2 text-xs text-gray-500 dark:text-neutral-400">
              {data.pastDueExcludedFromOfferConversion} past-due event
              {data.pastDueExcludedFromOfferConversion === 1 ? "" : "s"} excluded from offer step.
            </p>
          ) : null}
        </div>
      </div>

      {/* Reason × outcome */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700">
          Reason × outcome
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">Reason</th>
                <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Count</th>
                <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Share</th>
                <th className="text-right p-3 font-semibold text-emerald-700 dark:text-emerald-400">Saved</th>
                <th className="text-right p-3 font-semibold text-red-700 dark:text-red-400">Cancelled</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-neutral-300">Abandoned</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !data ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-neutral-400">
                    Loading…
                  </td>
                </tr>
              ) : (
                CANCELLATION_REASONS.map((reason) => {
                  const row = data.byReason[reason];
                  const disabled = row.count === 0;
                  return (
                    <tr
                      key={reason}
                      onClick={() => {
                        if (!disabled) setReasonModalReason(reason);
                      }}
                      className={`border-t border-gray-100 dark:border-neutral-800 transition-colors ${
                        disabled
                          ? "cursor-default"
                          : "cursor-pointer hover:bg-red-50/60 dark:hover:bg-red-950/20"
                      }`}
                      title={disabled ? undefined : "View users with this reason"}
                    >
                      <td className="p-3 text-gray-900 dark:text-neutral-100">
                        {disabled ? (
                          REASON_LABELS[reason]
                        ) : (
                          <span className="font-medium underline-offset-2 hover:underline">
                            {REASON_LABELS[reason]}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {row.count}
                      </td>
                      <td className="p-3 text-right text-gray-600 dark:text-neutral-400">
                        {row.sharePct}%
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {row.accepted}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-red-700 dark:text-red-400">
                        {row.cancelled}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-600 dark:text-neutral-400">
                        {row.abandoned}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* "Other" free-text entries */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          “Other” reasons (free text)
        </h3>
        {isLoading || !data ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-neutral-400">Loading…</div>
        ) : data.otherReasonTexts.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-neutral-400">
            No free-text “Other” entries in this window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100 w-32">
                    Outcome
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100 w-44">
                    Started
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100 w-64">
                    User
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    What they wrote
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.otherReasonTexts.map((entry, i) => {
                  const fullName = [entry.userFirstName, entry.userLastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const displayText = entry.userEmail
                    ? entry.userEmail
                    : entry.userId
                      ? `User ${entry.userId.slice(-6)}`
                      : "—";
                  return (
                    <tr
                      key={`${entry.startedAt}-${i}`}
                      className="border-t border-gray-100 dark:border-neutral-800 align-top"
                    >
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_CHIP[entry.outcome]}`}
                        >
                          {entry.outcome === "in_progress" ? "in progress" : entry.outcome}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600 dark:text-neutral-400 font-mono tabular-nums whitespace-nowrap">
                        {formatInTimeZone(new Date(entry.startedAt), AEST_TIMEZONE, "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {entry.userId ? (
                          <ClickableUserDisplay
                            displayText={displayText}
                            userId={entry.userId}
                            subtext={fullName || undefined}
                            className="text-sm font-medium text-gray-900 dark:text-neutral-100"
                          />
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-900 dark:text-neutral-100 whitespace-pre-wrap break-words">
                        {entry.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retention 90 summary + per offer */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <MetricCard
          title="Retained 90d"
          value={
            isLoading || !data
              ? "—"
              : retainedPct(data.retention90.retained, data.retention90.churned)
          }
          subtitle={
            data
              ? `${data.retention90.retained} retained / ${data.retention90.churned} churned`
              : undefined
          }
          icon={ShieldCheck}
          color="emerald"
        />
        <MetricCard
          title="Pending"
          value={isLoading ? "—" : (data?.retention90.pending ?? 0).toLocaleString()}
          subtitle="saved < 90 days ago"
          icon={Clock}
          color="yellow"
        />
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700">
          90-day retention by offer
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">Offer</th>
                <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Saved</th>
                <th className="text-right p-3 font-semibold text-emerald-700 dark:text-emerald-400">
                  Retained
                </th>
                <th className="text-right p-3 font-semibold text-red-700 dark:text-red-400">Churned</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-neutral-300">
                  Pending
                </th>
                <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                  Retained %
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !data ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-neutral-400">
                    Loading…
                  </td>
                </tr>
              ) : (
                OFFER_TYPES.map((offer) => {
                  const split = data.retention90ByOffer[offer];
                  return (
                    <tr
                      key={offer}
                      className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors"
                    >
                      <td className="p-3 text-gray-900 dark:text-neutral-100">{OFFER_LABELS[offer]}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {data.byOfferAccepted[offer]}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {split.retained}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-red-700 dark:text-red-400">
                        {split.churned}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-600 dark:text-neutral-400">
                        {split.pending}
                      </td>
                      <td className="p-3 text-right text-gray-700 dark:text-neutral-200">
                        {retainedPct(split.retained, split.churned)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
