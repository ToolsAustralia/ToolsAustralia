"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  Download,
  ExternalLink,
  Layers,
  Package,
  Receipt,
  RotateCcw,
  Search,
  Wallet,
} from "lucide-react";
import { FilterDropdown } from "@/components/admin/ui/FilterDropdown";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { type DateRange } from "@/components/admin/DateRangeToggle";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { AdminMobileLayoutDateRangeShell } from "./AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import {
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
} from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { usePermissions } from "@/hooks/usePermissions";
import { useDebounce } from "@/hooks/useDebounce";
import { downloadReceiptsCsv, useReceipts } from "@/hooks/queries/admin/useReceipts";
import {
  RECEIPT_CATEGORIES,
  RECEIPT_CATEGORY_LABELS,
  RECEIPT_REFUND_STATUS_LABELS,
  RECEIPT_REFUND_STATUSES,
  type ReceiptCategory,
  type ReceiptRefundStatus,
  type ReceiptRow,
} from "@/utils/admin/receipts";
import { formatDisplayName } from "@/utils/display-name";

const AEST_TIMEZONE = "Australia/Sydney";
const PAGE_SIZE = 50;

function formatAud(amount: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultLast30Days() {
  const today = new Date();
  return {
    start: format(subDays(today, 29), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
  };
}

function RefundStatusBadge({ status }: { status: ReceiptRefundStatus }) {
  const styles: Record<ReceiptRefundStatus, string> = {
    none: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    refunded: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    "partially-refunded": "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  };
  const labels: Record<ReceiptRefundStatus, string> = {
    none: "Paid",
    refunded: "Refunded",
    "partially-refunded": "Partially refunded",
  };
  return (
    <span
      className={`inline-flex whitespace-nowrap items-center rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

/** A Stripe id as a dashboard link, or plain text when we can't build one. */
function StripeLink({ label, url }: { label: string | null; url: string | null }) {
  if (!label) return <span className="text-gray-400 dark:text-neutral-600">—</span>;
  if (!url) {
    return <span className="font-mono text-2xs text-gray-500 dark:text-neutral-400">{label}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-2xs text-gray-600 hover:text-red-600 hover:underline dark:text-neutral-400 dark:hover:text-red-400"
    >
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

function ReceiptAmount({ row }: { row: ReceiptRow }) {
  return (
    <div className="text-right">
      <div
        className={
          row.refundStatus === "refunded"
            ? "text-sm font-semibold text-gray-400 line-through dark:text-neutral-500"
            : "text-sm font-semibold text-gray-900 dark:text-white"
        }
      >
        {formatAud(row.amount)}
      </div>
      {row.refundStatus !== "none" && (
        <div className="text-2xs text-gray-500 dark:text-neutral-400">
          net {formatAud(row.netAmount)}
        </div>
      )}
    </div>
  );
}

export default function ReceiptsManagement() {
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();
  const { has } = usePermissions();
  const canExport = has("receipts.export");

  const initialRange = useMemo(() => defaultLast30Days(), []);
  const [dateRange, setDateRange] = useState<DateRange>("custom");
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [category, setCategory] = useState<ReceiptCategory | "">("");
  const [status, setStatus] = useState<ReceiptRefundStatus | "">("");
  const [packageName, setPackageName] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(1);

  // A new search term restarts paging — otherwise you land on page 7 of a 2-page result.
  useEffect(() => {
    setPage(1);
  }, [search]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

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
    setPage(1);
  };

  const filter = useMemo(
    () => ({
      dateRange,
      startDate,
      endDate,
      category: category || undefined,
      status: status || undefined,
      packageName: packageName || undefined,
      search: search.trim() || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [dateRange, startDate, endDate, category, status, packageName, search, page]
  );

  // Draw presets resolve to "" until the draw dates load; querying before then would ask
  // the API for a custom range with no bounds and get a 400 back.
  const isRangeResolved = Boolean(startDate && endDate);
  const { data, isLoading, isFetching, isError } = useReceipts(filter, isRangeResolved);

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const pagination = data?.pagination;
  // Held across refetches so the Package dropdown doesn't empty itself mid-interaction
  // (the list is not narrowed by the package filter, so the last non-empty one stays valid).
  const [packageOptions, setPackageOptions] = useState<{ packageName: string; count: number }[]>([]);
  useEffect(() => {
    if (data?.packageOptions) setPackageOptions(data.packageOptions);
  }, [data?.packageOptions]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportNotice(null);
    try {
      const result = await downloadReceiptsCsv(filter);
      if (result.truncated) {
        setExportNotice(
          `Exported the first ${result.rowCount.toLocaleString()} of ${result.totalCount.toLocaleString()} rows — narrow the date range to capture the rest.`
        );
      }
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd")) return format(s, "MMM d, yyyy");
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
    <DateRangeDropdown
      selectedRange={dateRange}
      onRangeChange={(range) => updateDateFilter(range)}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      displayDate={displayDate}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Receipts</h2>
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

      {/* Summary — the headline figure is net, and says so. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          title="Total received"
          value={isLoading || !totals ? "—" : formatAud(totals.net)}
          icon={Wallet}
          color="emerald"
          subtitle="Net of refunds"
        />
        <MetricCard
          title="Gross"
          value={isLoading || !totals ? "—" : formatAud(totals.gross)}
          icon={Receipt}
          color="blue"
          subtitle="Before refunds"
        />
        <MetricCard
          title="Refunded"
          value={isLoading || !totals ? "—" : formatAud(totals.refunded)}
          icon={RotateCcw}
          color="red"
          subtitle="Returned to customers"
        />
        <MetricCard
          title="Payments"
          value={isLoading || !totals ? "—" : totals.count.toLocaleString()}
          icon={Receipt}
          color="purple"
          subtitle="Rows in this filter"
        />
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
          Failed to load receipts. Try refreshing or adjusting the date range.
        </div>
      )}

      {data?.searchTruncated && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          That search matches too many customers to resolve in full — these rows are a subset.
          Narrow it (a full email is exact) before trusting the totals.
        </div>
      )}

      {exportNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          {exportNotice}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or email…"
                aria-label="Search customer name or email"
                className="w-56 rounded-xl border border-neutral-200 bg-white py-2 pl-8 pr-3 text-sm font-medium text-neutral-700 placeholder-neutral-400 transition hover:border-neutral-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500 dark:hover:border-neutral-600"
              />
            </div>
            <FilterDropdown
              ariaLabel="Category"
              icon={Layers}
              allLabel="All categories"
              value={category}
              onChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
              options={RECEIPT_CATEGORIES.map((c) => ({
                value: c,
                label: RECEIPT_CATEGORY_LABELS[c],
              }))}
            />
            <FilterDropdown
              ariaLabel="Status"
              icon={CircleDot}
              allLabel="All statuses"
              width={220}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={RECEIPT_REFUND_STATUSES.map((s) => ({
                value: s,
                label: RECEIPT_REFUND_STATUS_LABELS[s],
              }))}
            />
            <FilterDropdown
              ariaLabel="Package"
              icon={Package}
              allLabel="All packages"
              width={300}
              value={packageName}
              onChange={(v) => {
                setPackageName(v);
                setPage(1);
              }}
              options={packageOptions.map((p) => ({
                value: p.packageName,
                label: p.packageName,
                hint: p.count.toLocaleString(),
              }))}
            />
            {(category || status || packageName || searchInput) && (
              <button
                type="button"
                onClick={() => {
                  setCategory("");
                  setStatus("");
                  setPackageName("");
                  setSearchInput("");
                  setPage(1);
                }}
                className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-neutral-400 dark:hover:text-red-400"
              >
                Clear filters
              </button>
            )}
            {pagination && pagination.totalCount > 0 && (
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                {pagination.totalCount.toLocaleString()} payment
                {pagination.totalCount === 1 ? "" : "s"}
              </span>
            )}
            {isFetching && !isLoading && (
              <span className="text-xs text-gray-400 dark:text-neutral-500">Updating…</span>
            )}
          </div>
          {canExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || rows.length === 0}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? "Exporting…" : "Export CSV"}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Loading receipts…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No payments in this filter
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
              {category === "shop-order"
                ? "The shop hasn't launched yet, so there are no shop orders to show."
                : "Try widening the date range or clearing the category filter."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Date
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Customer
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Category
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Package
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Amount
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Status
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Stripe
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {formatDateTime(row.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <ClickableUserDisplay
                          displayText={
                            formatDisplayName(row.customer.firstName, row.customer.lastName) ||
                            row.customer.email ||
                            "(unknown)"
                          }
                          subtext={row.customer.email || undefined}
                          userId={row.customer.userId ?? undefined}
                          className="text-sm"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {RECEIPT_CATEGORY_LABELS[row.category]}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {row.packageName}
                      </td>
                      <td className="px-4 py-3">
                        <ReceiptAmount row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <RefundStatusBadge status={row.refundStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <StripeLink label={row.stripe.objectLabel} url={row.stripe.objectUrl} />
                          <StripeLink label={row.stripe.customerId} url={row.stripe.customerUrl} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!pagination.hasPrevPage || isFetching}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pagination.hasNextPage || isFetching}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
