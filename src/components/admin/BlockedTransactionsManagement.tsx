"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  CreditCard,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  Trash2,
  Filter,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Clock,
  AlertTriangle,
  Search,
} from "lucide-react";
import Checkbox from "@/components/modals/ui/Checkbox";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import DateRangeToggle, { type DateRange } from "@/components/admin/DateRangeToggle";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import {
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
} from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import MultiSelectFilter, { type MultiSelectOption } from "@/components/admin/MultiSelectFilter";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useBlockedCards } from "@/hooks/queries/admin/useBlockedCards";
import { useAllowlistStats } from "@/hooks/queries/admin/useAllowlistStats";
import {
  useAllowlistActions,
  useApplyAllowlist,
  useReverseAllowlist,
  type ClientAllowlistAction,
} from "@/hooks/queries/admin/useAllowlistActions";
import type {
  BlockedFilter,
  BlockedRow,
  EligibilityKind,
  EvalInput,
} from "@/services/allowlist/types";
import { computeEligibilityKind } from "@/utils/admin/blockedTransactionEligibility";
import {
  DECLINE_CODE_LABELS,
  getDeclineCodeLabel,
} from "@/utils/billing/declineCodeLabels";
import { cn } from "@/utils/cn";

const AEST_TIMEZONE = "Australia/Sydney";

const ELIGIBILITY_OPTIONS: ReadonlyArray<MultiSelectOption> = [
  { value: "auto_eligible", label: "Auto-eligible" },
  { value: "already_allowlisted", label: "Already allowlisted" },
  { value: "fraud_signal", label: "Fraud signal" },
  { value: "permanent_issue", label: "Permanent issue" },
  { value: "not_member", label: "Skipped — not member" },
];

const DECLINE_CODE_OPTIONS: ReadonlyArray<MultiSelectOption> = (() => {
  const groupOrder = ["recoverable", "fraud", "permanent", "other"] as const;
  const groupLabels: Record<(typeof groupOrder)[number], string> = {
    recoverable: "Recoverable",
    fraud: "Fraud signals",
    permanent: "Permanent issues",
    other: "Other",
  };
  const opts: MultiSelectOption[] = [];
  for (const group of groupOrder) {
    for (const [code, meta] of Object.entries(DECLINE_CODE_LABELS)) {
      if (meta.group !== group) continue;
      opts.push({ value: code, label: meta.label, group: groupLabels[group] });
    }
  }
  return opts;
})();

function defaultLast30Days() {
  const today = new Date();
  return {
    start: format(subDays(today, 29), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
  };
}

function ymdToDate(ymd: string, endOfDay = false): Date {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return endOfDay
    ? new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999)
    : new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function formatDateTime(value: Date | string): string {
  return format(new Date(value), "MMM d, yyyy HH:mm");
}

function rowToApplyPayload(r: BlockedRow): EvalInput {
  return {
    cardFingerprint: r.cardFingerprint,
    cardLast4: r.cardLast4,
    cardBrand: r.cardBrand,
    stripeCustomerId: r.stripeCustomerId,
    customerEmail: r.customerEmail,
    declineCode: r.declineCode,
    failureCode: r.failureCode,
    triggeringPaymentIntentId: r.paymentIntentId,
    triggeringChargeId: r.chargeId,
  };
}

const eligibilityBadgeClasses: Record<EligibilityKind, string> = {
  auto_eligible: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  already_allowlisted: "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200",
  fraud_signal: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  permanent_issue: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  not_member: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
};

const eligibilityBadgeLabel: Record<EligibilityKind, string> = {
  auto_eligible: "Auto-eligible",
  already_allowlisted: "Already allowlisted",
  fraud_signal: "Fraud signal",
  permanent_issue: "Permanent issue",
  not_member: "Skipped — not member",
};

function EligibilityBadge({ row }: { row: BlockedRow }) {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: row.alreadyAllowlisted,
    preview: row.preview,
  });
  const Icon =
    kind === "auto_eligible"
      ? CheckCircle
      : kind === "fraud_signal" || kind === "permanent_issue"
        ? AlertTriangle
        : kind === "already_allowlisted"
          ? ShieldCheck
          : AlertCircle;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold", eligibilityBadgeClasses[kind])}
    >
      <Icon className="h-3 w-3" />
      {eligibilityBadgeLabel[kind]}
    </span>
  );
}

export default function BlockedTransactionsManagement() {
  const { showToast } = useToast();
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();

  const initialRange = useMemo(() => defaultLast30Days(), []);
  const [dateRange, setDateRange] = useState<DateRange>("custom");
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

  const [emailInput, setEmailInput] = useState("");
  const debouncedEmail = useDebounce(emailInput, 300);
  const [eligibilitySelected, setEligibilitySelected] = useState<string[]>([]);
  const [declineCodesSelected, setDeclineCodesSelected] = useState<string[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  const { data: drawDates } = useCurrentAndLastDrawDates();
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    let finalStart = start;
    let finalEnd = end;

    if (range === "today") {
      finalStart = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "yesterday") {
      finalStart = formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "current-draw" && drawDates?.currentDraw) {
      finalStart = drawDates.currentDraw.startDate;
      finalEnd = drawDates.currentDraw.endDate;
    } else if (range === "last-draw" && drawDates?.lastDraw) {
      finalStart = drawDates.lastDraw.startDate;
      finalEnd = drawDates.lastDraw.endDate;
    } else if (range === "all-time") {
      finalStart = formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    }

    setDateRange(range);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    }
  };

  const filter: BlockedFilter = useMemo(
    () => ({
      dateFrom: ymdToDate(startDate, false),
      dateTo: ymdToDate(endDate, true),
      email: debouncedEmail.trim() || undefined,
      declineCodes: declineCodesSelected.length > 0 ? declineCodesSelected : undefined,
      eligibility:
        eligibilitySelected.length > 0
          ? (eligibilitySelected as EligibilityKind[])
          : undefined,
    }),
    [startDate, endDate, debouncedEmail, declineCodesSelected, eligibilitySelected]
  );

  const {
    rows,
    total,
    hasMore,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useBlockedCards(filter);
  const statsQuery = useAllowlistStats();
  const { data: recentActions = [] } = useAllowlistActions("added", 50);
  const applyMutation = useApplyAllowlist();
  const reverseMutation = useReverseAllowlist();

  const eligibleRows = useMemo(() => rows.filter((r) => !r.alreadyAllowlisted), [rows]);

  const stats = useMemo(() => {
    let autoEligible = 0;
    let skippedFilter = 0;
    let fraud = 0;
    let permanent = 0;
    for (const r of rows) {
      if (r.alreadyAllowlisted) continue;
      if (r.preview.eligible) {
        autoEligible += 1;
        continue;
      }
      if (r.preview.reason === "filter_fraud_signal") fraud += 1;
      else if (r.preview.reason === "filter_permanent_issue") permanent += 1;
      else skippedFilter += 1;
    }
    return { total: rows.length, autoEligible, skippedFilter, fraud, permanent };
  }, [rows]);

  const allEligibleSelected =
    eligibleRows.length > 0 && eligibleRows.every((r) => selected.has(r.cardFingerprint));

  function toggleAll() {
    if (allEligibleSelected) setSelected(new Set());
    else setSelected(new Set(eligibleRows.map((r) => r.cardFingerprint)));
  }

  function toggleRow(fp: string) {
    const next = new Set(selected);
    if (next.has(fp)) next.delete(fp);
    else next.add(fp);
    setSelected(next);
  }

  async function handleApplySelected(allowOverride: boolean) {
    const payload = eligibleRows
      .filter((r) => selected.has(r.cardFingerprint))
      .map(rowToApplyPayload);
    if (payload.length === 0) {
      showToast({
        type: "error",
        title: "No selection",
        message: "Select at least one transaction before allowlisting.",
      });
      return;
    }
    try {
      const result = await applyMutation.mutateAsync({ rows: payload, allowOverride });
      setSelected(new Set());
      const errorCount = result.errors?.length ?? 0;
      showToast({
        type: errorCount > 0 ? "warning" : "success",
        title: "Allowlist applied",
        message: `Added ${result.added}, skipped ${result.skipped}${
          errorCount > 0 ? `, ${errorCount} error(s)` : ""
        }.`,
      });
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply allowlist";
      showToast({ type: "error", title: "Apply failed", message });
    }
  }

  async function handleAllowlistOne(r: BlockedRow) {
    setPendingRowId(r.paymentIntentId);
    try {
      const result = await applyMutation.mutateAsync({
        rows: [rowToApplyPayload(r)],
        allowOverride: false,
      });
      const errorCount = result.errors?.length ?? 0;
      if (result.added > 0) {
        showToast({
          type: "success",
          title: "Allowlisted",
          message: `Card ${r.cardBrand} ••${r.cardLast4} added to the Stripe allowlist.`,
        });
      } else if (errorCount > 0) {
        showToast({
          type: "error",
          title: "Allowlist failed",
          message: result.errors?.[0]?.message ?? "Stripe rejected the request.",
        });
      } else {
        showToast({
          type: "warning",
          title: "Skipped by filter",
          message:
            "The filter rules skipped this row. Use the bulk override button if you want to force it.",
        });
      }
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply allowlist";
      showToast({ type: "error", title: "Apply failed", message });
    } finally {
      setPendingRowId(null);
    }
  }

  async function handleReverse(actionId: string) {
    try {
      await reverseMutation.mutateAsync({ actionId });
      showToast({
        type: "success",
        title: "Removed from allowlist",
        message: "The card has been removed from the Stripe allowlist.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reverse allowlist";
      showToast({ type: "error", title: "Reverse failed", message });
    }
  }

  function resetFilters() {
    setEmailInput("");
    setEligibilitySelected([]);
    setDeclineCodesSelected([]);
    updateDateFilter("custom", initialRange.start, initialRange.end);
    setSelected(new Set());
  }

  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd")) {
          return format(s, "MMM d, yyyy");
        }
        return `${format(s, "MMM d")} - ${format(e, "MMM d, yyyy")}`;
      } catch {
        return undefined;
      }
    }
    if (dateRange === "all-time") return "All Time";
    if (dateRange === "current-draw") return "Current Draw";
    if (dateRange === "last-draw") return "Last Draw";
    return undefined;
  }, [dateRange, startDate, endDate]);

  const dateRangeToggle = (
    <DateRangeToggle
      selectedRange={dateRange}
      onRangeChange={(range) => {
        if (range === "custom") setIsCustomDateModalOpen(true);
        else updateDateFilter(range);
      }}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      collapsed={false}
      displayDate={displayDate}
      onExpand={() => {}}
      className={isLgUp ? undefined : "w-full"}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Blocked Transactions
        </h2>
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

      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total blocked"
          value={stats.total}
          icon={CreditCard}
          color="blue"
          subtitle="Matching current filters"
        />
        <MetricCard
          title="Auto-eligible"
          value={stats.autoEligible}
          icon={CheckCircle}
          color="emerald"
          subtitle="Safe to allowlist"
        />
        <MetricCard
          title="Skipped — filter"
          value={stats.skippedFilter + stats.fraud + stats.permanent}
          icon={AlertCircle}
          color="yellow"
          subtitle={`${stats.fraud} fraud · ${stats.permanent} permanent`}
        />
        <MetricCard
          title="Total on allowlist"
          value={statsQuery.data?.totalActiveAllowlisted ?? "—"}
          icon={ShieldCheck}
          color="purple"
          subtitle="All-time, currently active"
        />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Failed to load blocked transactions</p>
            <p className="mt-0.5 text-xs">
              {error.message || "Failed to load blocked transactions"}
            </p>
          </div>
        </div>
      )}

      {/* Filters card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Filter className="h-4 w-4 text-red-600" />
            Filters
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching ? "animate-spin" : "")} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen((cur) => !cur)}
              aria-expanded={isFiltersOpen}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 sm:hidden"
            >
              {isFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className={cn(isFiltersOpen ? "block" : "hidden sm:block")}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-neutral-300">
                Email
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Search by email"
                  className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                />
              </div>
            </div>
            <MultiSelectFilter
              label="Eligibility"
              options={ELIGIBILITY_OPTIONS}
              selected={eligibilitySelected}
              onChange={setEligibilitySelected}
              placeholder="Any eligibility"
            />
            <MultiSelectFilter
              label="Decline code"
              options={DECLINE_CODE_OPTIONS}
              selected={declineCodesSelected}
              onChange={setDeclineCodesSelected}
              placeholder="Any decline code"
            />
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 p-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <Checkbox
            id="bulk-select-all"
            name="bulk-select-all"
            checked={allEligibleSelected}
            onChange={toggleAll}
          />
          <label
            htmlFor="bulk-select-all"
            className="text-sm font-medium text-gray-700 dark:text-neutral-300 cursor-pointer"
          >
            Select all {eligibleRows.length} eligible
            {selected.size > 0 && (
              <span className="ml-2 text-xs font-semibold text-red-600 dark:text-red-400">
                ({selected.size} selected)
              </span>
            )}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={selected.size === 0 || applyMutation.isPending}
            onClick={() => handleApplySelected(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Allowlist {selected.size > 0 ? `${selected.size} ` : ""}selected
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || applyMutation.isPending}
            onClick={() => handleApplySelected(true)}
            title="Allow even rows the filter would skip"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          >
            <AlertTriangle className="h-4 w-4" />
            Allowlist with override
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        {total > 0 && (
          <div className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
            Showing {rows.length} of {total}
          </div>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Loading blocked transactions…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No blocked transactions in this range
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
              Try widening the date range, clearing the email search, or relaxing filters.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="w-10 bg-gray-50 px-4 py-3 dark:bg-neutral-800"></th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Date</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Email</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Card</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Decline</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Eligibility</th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {rows.map((r) => {
                    const isSelected = selected.has(r.cardFingerprint);
                    const isRowPending =
                      pendingRowId === r.paymentIntentId && applyMutation.isPending;
                    return (
                      <tr
                        key={r.paymentIntentId}
                        className={`transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70 ${
                          r.alreadyAllowlisted
                            ? "bg-gray-50/60 dark:bg-neutral-800/30"
                            : isSelected
                              ? "bg-red-50 dark:bg-red-950/20"
                              : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            id={`row-${r.paymentIntentId}`}
                            name={`row-${r.paymentIntentId}`}
                            checked={isSelected}
                            disabled={r.alreadyAllowlisted}
                            onChange={() => toggleRow(r.cardFingerprint)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          <ClickableUserDisplay
                            displayText={r.customerEmail ?? "—"}
                            userId={r.userId}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          <span className="font-mono">
                            {r.cardBrand} ••{r.cardLast4}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          {getDeclineCodeLabel(r.declineCode)}
                        </td>
                        <td className="px-4 py-3">
                          <EligibilityBadge row={r} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={r.alreadyAllowlisted || isRowPending}
                            onClick={() => handleAllowlistOne(r)}
                            title={
                              r.alreadyAllowlisted
                                ? "This card is already on the Stripe allowlist"
                                : "Add this card to the Stripe allowlist"
                            }
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {r.alreadyAllowlisted ? "Allowlisted" : isRowPending ? "Working…" : "Allowlist"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-gray-200 dark:divide-neutral-700 sm:hidden">
              {rows.map((r) => {
                const isSelected = selected.has(r.cardFingerprint);
                const isRowPending =
                  pendingRowId === r.paymentIntentId && applyMutation.isPending;
                return (
                  <div
                    key={r.paymentIntentId}
                    className={`p-4 ${
                      r.alreadyAllowlisted
                        ? "bg-gray-50/60 dark:bg-neutral-800/30"
                        : isSelected
                          ? "bg-red-50 dark:bg-red-950/20"
                          : ""
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <ClickableUserDisplay
                          displayText={r.customerEmail ?? "—"}
                          userId={r.userId}
                          className="text-sm font-semibold text-gray-900 dark:text-white"
                        />
                        <p className="mt-1 font-mono text-xs text-gray-600 dark:text-neutral-400">
                          {r.cardBrand} ••{r.cardLast4}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">
                          {formatDateTime(r.createdAt)}
                        </p>
                      </div>
                      <Checkbox
                        id={`row-mobile-${r.paymentIntentId}`}
                        name={`row-mobile-${r.paymentIntentId}`}
                        checked={isSelected}
                        disabled={r.alreadyAllowlisted}
                        onChange={() => toggleRow(r.cardFingerprint)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-neutral-400">
                      <EligibilityBadge row={r} />
                      {r.declineCode && <span>· {getDeclineCodeLabel(r.declineCode)}</span>}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={r.alreadyAllowlisted || isRowPending}
                        onClick={() => handleAllowlistOne(r)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {r.alreadyAllowlisted ? "Allowlisted" : isRowPending ? "Working…" : "Allowlist"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", isFetchingNextPage ? "animate-spin" : "")}
                  />
                  {isFetchingNextPage ? "Loading more..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recently allowlisted card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Recently allowlisted
            </h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-neutral-400">last 50</span>
        </div>
        {recentActions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Nothing yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-neutral-700">
            {recentActions.map((action: ClientAllowlistAction) => (
              <li
                key={action._id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm text-gray-700 dark:text-neutral-300">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-neutral-400">
                      {formatDateTime(action.createdAt)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {action.source}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-medium text-gray-900 dark:text-white">
                    {action.customerEmail ?? "—"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-neutral-400">
                    {action.cardBrand} ••{action.cardLast4}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={reverseMutation.isPending}
                  onClick={() => handleReverse(action._id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
