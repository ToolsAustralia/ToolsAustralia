import { useInfiniteQuery } from "@tanstack/react-query";

export interface StaffActivityRow {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRoleName: string;
  action: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  status: number;
  timestamp: string;
}

interface Page {
  success: true;
  data: { rows: StaffActivityRow[]; nextCursor: string | null };
}

export interface StaffActivityFilters {
  actorId?: string;
  action?: string;
  status?: number;
  resourceType?: string;
  resourceId?: string;
  from?: string; // ISO
  to?: string;   // ISO
  limit?: number;
}

async function fetchPage(
  filters: StaffActivityFilters,
  cursor: string | null
): Promise<Page> {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.status !== undefined) params.set("status", String(filters.status));
  if (filters.resourceType) params.set("resourceType", filters.resourceType);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (cursor) params.set("cursor", cursor);

  const r = await fetch(`/api/admin/staff-activity?${params}`);
  if (!r.ok) {
    let msg = "Failed to load staff activity";
    try {
      const data = await r.json();
      if (typeof data?.error === "string") msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

const EMPTY_FILTERS: StaffActivityFilters = {};

/**
 * Infinite-scroll list of audit-log rows. Used by both the top-level
 * /admin/staff-activity page and the embedded Activity tab inside
 * UserDetailModal (which passes resourceType:"User" + resourceId).
 */
export function useStaffActivity(
  filters: StaffActivityFilters = EMPTY_FILTERS,
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery<Page, Error>({
    queryKey: ["admin", "staff-activity", filters],
    queryFn: ({ pageParam }) =>
      fetchPage(filters, (pageParam as string | null) ?? null),
    initialPageParam: null,
    getNextPageParam: (last) => last.data.nextCursor,
    enabled: options?.enabled ?? true,
  });
}
