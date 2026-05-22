"use client";

import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useStaffActivity } from "@/hooks/queries/useStaffActivity";

interface Props {
  userId: string;
  /** Controls when the underlying query fires — pass `activeTab === "staff-activity"`
   *  so opening the modal doesn't fire an audit-log fetch for users who never click
   *  the tab. */
  enabled?: boolean;
}

/**
 * Embedded audit view inside UserDetailModal. Shows only rows where
 * resourceType="User" and resourceId matches the open user. Gated upstream
 * by `audit.view` (the tab itself is hidden when the viewer lacks it).
 */
export default function ActivityTab({ userId, enabled = true }: Props) {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStaffActivity(
      {
        resourceType: "User",
        resourceId: userId,
        limit: 25,
      },
      { enabled }
    );

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading staff activity…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-700 dark:text-red-400">
        {error.message}
      </div>
    );
  }

  const rows = data?.pages.flatMap((p) => p.data.rows) ?? [];
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" />
        No staff have taken any action on this user yet.
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4">
      <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {rows.map((row) => {
          const isForbidden = row.status === 403;
          return (
            <li
              key={row.id}
              className={`px-3 py-2.5 flex items-start gap-3 ${
                isForbidden ? "bg-red-50/40 dark:bg-red-950/15" : ""
              }`}
            >
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap mt-0.5">
                {formatTimestamp(row.timestamp)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {row.actorEmail}{" "}
                  <span className="text-gray-500 dark:text-gray-400">
                    ({row.actorRoleName})
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-mono mt-0.5 truncate">
                  {row.method} {row.action}
                </div>
              </div>
              {isForbidden && (
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              )}
            </li>
          );
        })}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 w-full text-xs text-[#ee0000] dark:text-[#ff4444] hover:underline py-2 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load older entries"}
        </button>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? format(d, "MMM d HH:mm") : iso;
}
