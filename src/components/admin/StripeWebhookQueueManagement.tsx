"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Play,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/utils/cn";

type StatusKey = "queued" | "processing" | "succeeded" | "dead";

type Row = {
  _id: string;
  eventId: string;
  type: string;
  status: StatusKey;
  attempts: number;
  nextAttemptAt: string;
  claimedAt: string | null;
  lastError: string | null;
  enqueuedAt: string;
  processedAt: string | null;
};

const PAGE_SIZE = 25;
const STATUS_FILTERS: ReadonlyArray<{ value: "" | StatusKey; label: string }> = [
  { value: "", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "succeeded", label: "Succeeded" },
  { value: "dead", label: "Dead-lettered" },
];

const statusBadgeClasses: Record<StatusKey, string> = {
  queued: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  processing: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  dead: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
};

function StatusBadge({ status }: { status: StatusKey }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold capitalize",
        statusBadgeClasses[status]
      )}
    >
      {status}
    </span>
  );
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return format(new Date(value), "MMM d, yyyy HH:mm");
  } catch {
    return "—";
  }
}

export default function StripeWebhookQueueManagement() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<StatusKey, number>>({
    queued: 0,
    processing: 0,
    succeeded: 0,
    dead: 0,
  });
  const [status, setStatus] = useState<"" | StatusKey>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String((page - 1) * PAGE_SIZE),
      });
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/stripe-webhook-queue?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const data = (await res.json()) as { rows: Row[]; total: number };
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      showToast({ type: "error", title: "Failed to load queue", message });
    } finally {
      setLoading(false);
    }
  }, [page, status, showToast]);

  const fetchCounts = useCallback(async () => {
    try {
      const statuses: StatusKey[] = ["queued", "processing", "succeeded", "dead"];
      const results = await Promise.all(
        statuses.map(async (s) => {
          const res = await fetch(`/api/admin/stripe-webhook-queue?status=${s}&limit=1&skip=0`);
          if (!res.ok) return [s, 0] as const;
          const data = (await res.json()) as { total: number };
          return [s, data.total] as const;
        })
      );
      setCounts({
        queued: results.find(([s]) => s === "queued")?.[1] ?? 0,
        processing: results.find(([s]) => s === "processing")?.[1] ?? 0,
        succeeded: results.find(([s]) => s === "succeeded")?.[1] ?? 0,
        dead: results.find(([s]) => s === "dead")?.[1] ?? 0,
      });
    } catch {
      // Non-blocking — header tiles just show 0 if counts fail
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  // Reset to first page when the filter changes
  useEffect(() => {
    setPage(1);
  }, [status]);

  async function handleReplay(_id: string) {
    setReplayingId(_id);
    try {
      const res = await fetch("/api/admin/stripe-webhook-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _id }),
      });
      if (!res.ok) throw new Error(`Replay failed: ${res.status}`);
      const data = (await res.json()) as { replayed?: boolean; eventId?: string };
      showToast({
        type: "success",
        title: "Replay dispatched",
        message: `Event ${data.eventId ?? _id} sent to worker`,
      });
      // Worker typically completes in 5–15s; refresh shortly so the row's new status shows.
      setTimeout(() => {
        void fetchRows();
        void fetchCounts();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      showToast({ type: "error", title: "Replay failed", message });
    } finally {
      setReplayingId(null);
    }
  }

  const handleRefresh = () => {
    void fetchRows();
    void fetchCounts();
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      {/* Top metric tiles — at-a-glance health */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon={Clock} title="Queued" value={counts.queued} color="blue" />
        <MetricCard icon={Activity} title="Processing" value={counts.processing} color="orange" />
        <MetricCard icon={CheckCircle2} title="Succeeded" value={counts.succeeded} color="emerald" />
        <MetricCard
          icon={AlertTriangle}
          title="Dead-lettered"
          value={counts.dead}
          color={counts.dead > 0 ? "red" : "blue"}
        />
      </div>

      {/* Description + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          Async processing pipeline for Stripe webhook events. Click <strong>Replay</strong> on any
          row to re-dispatch it to the worker. Idempotency-safe: layer-4 dedup blocks double-grants.
        </p>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filter pills + pagination summary */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value || "all"}
            onClick={() => setStatus(s.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              status === s.value
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            )}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500 dark:text-neutral-400">
          {total === 0 ? "No rows" : `Showing ${start}–${end} of ${total}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-900">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">Event ID</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Attempts</th>
              <th className="px-4 py-3 font-semibold">Next Attempt</th>
              <th className="px-4 py-3 font-semibold">Last Error</th>
              <th className="px-4 py-3 font-semibold">Enqueued</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-gray-500 dark:text-neutral-400"
                >
                  No queue rows match the current filter.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row._id}
                className="border-t border-gray-100 align-top dark:border-neutral-800"
              >
                <td
                  className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-neutral-200"
                  title={row.eventId}
                >
                  {row.eventId}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-neutral-200">
                  {row.type}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">{row.attempts}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-neutral-300">
                  {formatDateTime(row.nextAttemptAt)}
                </td>
                <td
                  className="max-w-md truncate px-4 py-3 text-xs text-red-600 dark:text-red-300"
                  title={row.lastError ?? ""}
                >
                  {row.lastError ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-neutral-300">
                  {formatDateTime(row.enqueuedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled={replayingId === row._id}
                    onClick={() => void handleReplay(row._id)}
                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" />
                    {replayingId === row._id ? "Replaying…" : "Replay"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-neutral-300">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
