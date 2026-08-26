"use client";

// Drives the admin "Receipts" tab off `/api/admin/receipts`.
//
// Imports its types from `@/utils/admin/receipts`, never from
// `@/services/admin/receipts` — the service imports Mongoose models, and pulling those into
// a client component ships the data layer to the browser.

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { ReceiptCategory, ReceiptRefundStatus, ReceiptsData } from "@/utils/admin/receipts";

export interface ReceiptsFilter {
  /** Preset name understood by `resolveRevenueDetailsRange`. */
  dateRange: string;
  /** yyyy-MM-dd (AEST). Required by the API for custom + draw presets. */
  startDate?: string;
  endDate?: string;
  category?: ReceiptCategory;
  status?: ReceiptRefundStatus;
  packageName?: string;
  /** Free text over customer name + email. Debounce before putting it in here — it is the cache key. */
  search?: string;
  page: number;
  limit?: number;
}

type ReceiptsResponse = { success: true; data: ReceiptsData };

/** Serialised filter — doubles as the cache key and the request query string. */
export function buildReceiptsQueryString(
  filter: ReceiptsFilter,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams({ dateRange: filter.dateRange });
  if (filter.startDate) params.set("startDate", filter.startDate);
  if (filter.endDate) params.set("endDate", filter.endDate);
  if (filter.category) params.set("category", filter.category);
  if (filter.status) params.set("status", filter.status);
  if (filter.packageName) params.set("packageName", filter.packageName);
  if (filter.search) params.set("search", filter.search);
  params.set("page", String(filter.page));
  if (filter.limit) params.set("limit", String(filter.limit));
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  return params.toString();
}

export function useReceipts(filter: ReceiptsFilter, enabled = true) {
  const queryString = buildReceiptsQueryString(filter);

  const query = useQuery<ReceiptsResponse>({
    queryKey: queryKeys.admin.receipts(queryString),
    queryFn: () => apiGet<ReceiptsResponse>(`/api/admin/receipts?${queryString}`),
    enabled,
    // Paging a ledger shouldn't blank the table between pages.
    placeholderData: keepPreviousData,
  });

  return {
    data: query.data?.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export interface ReceiptsCsvResult {
  rowCount: number;
  totalCount: number;
  truncated: boolean;
}

/**
 * Download the CSV for the current filter.
 *
 * Server-rendered rather than built from the loaded page: the file covers the WHOLE filter,
 * and the export carries its own `receipts.export` permission, which only the server can
 * actually enforce.
 */
export async function downloadReceiptsCsv(filter: ReceiptsFilter): Promise<ReceiptsCsvResult> {
  const queryString = buildReceiptsQueryString(filter, { format: "csv" });
  const response = await fetch(`/api/admin/receipts?${queryString}`);
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "You don't have permission to export receipts."
        : `Export failed (${response.status})`
    );
  }

  const blob = await response.blob();
  const filename =
    response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "receipts.csv";

  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    rowCount: Number(response.headers.get("X-Receipts-Row-Count") ?? 0),
    totalCount: Number(response.headers.get("X-Receipts-Total-Count") ?? 0),
    truncated: response.headers.get("X-Receipts-Truncated") === "true",
  };
}
