"use client";

import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useStaffActivity,
  type StaffActivityFilters,
  type StaffActivityRow,
} from "@/hooks/queries/useStaffActivity";
import { format } from "date-fns";

/**
 * Top-level audit viewer at /admin/staff-activity. Lists every row in
 * StaffActivity newest-first with filter chips and infinite scroll.
 * Forbidden (403) rows get a red warning badge.
 */
export default function StaffActivityManagement() {
  const { has, isLoading: permsLoading } = usePermissions();
  const [filters, setFilters] = useState<StaffActivityFilters>({ limit: 25 });
  const [search, setSearch] = useState("");

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStaffActivity(filters);
  const observerRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    const target = observerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (permsLoading) {
    return (
      <div className="p-10 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!has("audit.view")) {
    return (
      <div className="p-10 text-gray-600 dark:text-gray-300">
        You don&apos;t have permission to view the audit log.
      </div>
    );
  }

  const rows = data?.pages.flatMap((p) => p.data.rows) ?? [];

  // Client-side text search across actor email + path (server doesn't
  // support full-text in Phase 1 — deferred per spec).
  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.actorEmail.toLowerCase().includes(q) ||
          r.path.toLowerCase().includes(q) ||
          r.actorRoleName.toLowerCase().includes(q)
        );
      })
    : rows;

  return (
    <div className="space-y-4">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actor email, path, role…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <FilterChip
          label="All"
          active={filters.status === undefined}
          onClick={() => {
            if (filters.status !== undefined) setFilters({ ...filters, status: undefined });
          }}
        />
        <FilterChip
          label="Successful"
          active={filters.status === 200}
          onClick={() => {
            if (filters.status !== 200) setFilters({ ...filters, status: 200 });
          }}
        />
        <FilterChip
          label="Forbidden"
          active={filters.status === 403}
          onClick={() => {
            if (filters.status !== 403) setFilters({ ...filters, status: 403 });
          }}
        />
      </div>

      {search.trim() && hasNextPage && (
        <div className="px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
          Searching loaded rows only. Scroll to the bottom to load more rows before retrying your search.
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-300">
          {error.message}
        </div>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading && rows.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </li>
        )}
        {!isLoading && filtered.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No audit-log rows match the current filters.
          </li>
        )}
        {filtered.map((row) => (
          <ActivityRow key={row.id} row={row} />
        ))}
      </ul>

      <div ref={observerRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-3">
          Loading more…
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full font-medium transition-colors ${
        active
          ? "bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white shadow-sm"
          : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
      }`}
    >
      {label}
    </button>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? format(d, "MMM d HH:mm:ss") : iso;
}

function ActivityRow({ row }: { row: StaffActivityRow }) {
  const isForbidden = row.status === 403;
  return (
    <li
      className={`px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${
        isForbidden ? "bg-red-50/40 dark:bg-red-950/15" : ""
      }`}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono">
        {formatTimestamp(row.timestamp)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {row.actorEmail}{" "}
          <span className="text-gray-500 dark:text-gray-400 font-normal">
            ({row.actorRoleName})
          </span>{" "}
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {row.action}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono mt-0.5">
          {row.method} {row.path}
          {row.resourceType && row.resourceId && (
            <span className="ml-2" title={row.resourceId}>
              · {row.resourceType} {row.resourceId.slice(0, 8)}…
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        {isForbidden ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/40 px-2 py-1 rounded-md">
            <AlertTriangle className="w-3 h-3" />
            403 Forbidden
          </span>
        ) : (
          <span className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/40 px-2 py-1 rounded-md">
            {row.status}
          </span>
        )}
      </div>
    </li>
  );
}
