"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useChargePastDueRunDetail } from "@/hooks/queries/admin/useChargePastDueRunDetail";
import { formatDurationMs, isStrandedError } from "@/utils/admin/chargePastDueFormat";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import {
  groupChargeAttemptsByUser,
  type UserAttemptGroup,
} from "@/utils/admin/groupChargeAttemptsByUser";
import AttemptsBreakdown from "@/components/admin/AttemptsBreakdown";
import BulkRecoverInvoicesModal, { type BulkRecoverItem } from "@/components/admin/BulkRecoverInvoicesModal";
import { useQueryClient } from "@tanstack/react-query";
import {
  SKIP_BUCKET_LABELS,
  SKIP_BUCKET_ORDER,
  classifySkipBucketFromMessage,
  type SkipBucketKey,
} from "@/utils/admin/chargeSkipReasons";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    aborted: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200"
      }`}
    >
      {status}
    </span>
  );
}

type AttemptStatus = "success" | "failed" | "skipped";

const ALL_STATUSES: readonly AttemptStatus[] = ["success", "failed", "skipped"];

const STATUS_FILTERS: { value: AttemptStatus; label: string; active: string }[] = [
  {
    value: "success",
    label: "Succeeded",
    active:
      "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800",
  },
  {
    value: "failed",
    label: "Failed",
    active:
      "bg-red-100 text-red-800 ring-red-300 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800",
  },
  {
    value: "skipped",
    label: "Skipped",
    active:
      "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800",
  },
];

function RetryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    skipped: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200"
      }`}
    >
      {status}
    </span>
  );
}

export default function PastDueChargeHistoryDrawer({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useChargePastDueRunDetail(runId);

  const [search, setSearch] = useState("");
  const [activeStatuses, setActiveStatuses] = useState<Set<AttemptStatus>>(
    () => new Set(ALL_STATUSES)
  );
  // Decline-reason filter: when set, only user-groups with a failed attempt carrying
  // this decline/error code are shown. Chips in the "Why charges declined" panel toggle it.
  const [declineFilter, setDeclineFilter] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Derive the canonical decline code for a failed attempt (same precedence as the
  // Error cell + the server's summariseDeclineCodes).
  const declineCodeOf = (r: { declineCode?: string; errorCode?: string }) =>
    r.declineCode ?? r.errorCode ?? "unknown";

  // Per-run SKIP BREAKDOWN, computed client-side from the run's rows so it is accurate
  // for EVERY run (including historical runs whose persisted totals predate the named
  // buckets and lumped everything into "Other").
  const skipBreakdown = useMemo(() => {
    const counts: Record<SkipBucketKey, number> = {
      noHeldDraft: 0,
      awaitingRetry: 0,
      recentlyAttempted: 0,
      noLongerPastDue: 0,
      alreadyPaid: 0,
      missingPaymentMethod: 0,
      other: 0,
    };
    for (const r of detailQuery.data?.rows ?? []) {
      if (r.status === "skipped") counts[classifySkipBucketFromMessage(r.errorMessage)] += 1;
    }
    return counts;
  }, [detailQuery.data]);

  // Per-run decline breakdown (failed attempts grouped by decline/error code), sorted desc.
  const declineBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of detailQuery.data?.rows ?? []) {
      if (r.status === "failed") {
        const code = declineCodeOf(r);
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [detailQuery.data]);

  // The drawer's per-row DTO has no `adminName` (one admin per run). Augment with the run's
  // admin so each row satisfies ChargeAttemptInput before grouping.
  const groupedAttempts = useMemo(() => {
    const rows = detailQuery.data?.rows ?? [];
    const adminName = detailQuery.data?.run.adminName ?? "";
    const augmented = rows.map((r) => ({ ...r, adminName }));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? augmented.filter((r) => (r.userEmail ?? "").toLowerCase().includes(q))
      : augmented;
    // Decline-reason filter: keep only user-groups that have a failed attempt with the
    // selected code. Applied at the group level below so a user with a mix still shows.
    const groups = groupChargeAttemptsByUser(filtered);
    let result = groups;
    if (declineFilter) {
      result = result.filter((g) =>
        g.attempts.some((a) => a.status === "failed" && declineCodeOf(a) === declineFilter)
      );
    }
    // Status filter ("any matching attempt"): keep a user if at least one of
    // their attempts has a status in the active set. An empty set is treated
    // as no filter so the list never goes mysteriously blank.
    const effective = activeStatuses.size === 0 ? new Set(ALL_STATUSES) : activeStatuses;
    if (effective.size !== ALL_STATUSES.length) {
      result = result.filter(
        (g) =>
          (effective.has("success") && g.successCount > 0) ||
          (effective.has("failed") && g.failedCount > 0) ||
          (effective.has("skipped") && g.skippedCount > 0)
      );
    }
    return result;
  }, [detailQuery.data, search, activeStatuses, declineFilter]);

  const selectableItems = useMemo<BulkRecoverItem[]>(() => {
    const items: BulkRecoverItem[] = [];
    for (const group of groupedAttempts) {
      if (!group.userId) continue;
      for (const attempt of group.attempts) {
        if (attempt.status !== "failed") continue;
        if (!isStrandedError(attempt.errorMessage, attempt.errorCode)) continue;
        items.push({
          userId: group.userId,
          userEmail: group.userEmail || "",
          originalInvoiceId: attempt.invoiceId,
          amount: attempt.amount,
        });
      }
    }
    return items;
  }, [groupedAttempts]);

  const selectedItems = useMemo<BulkRecoverItem[]>(() => {
    return selectableItems.filter((item) =>
      selectedKeys.has(`${item.userId}__${item.originalInvoiceId}`)
    );
  }, [selectableItems, selectedKeys]);

  const toggleRow = (userId: string, invoiceId: string) => {
    const key = `${userId}__${invoiceId}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleStatus = (s: AttemptStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const groupKey = (g: UserAttemptGroup): string => g.userId ?? `email:${g.userEmail}`;
  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!runId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto bg-white shadow-2xl dark:bg-neutral-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/95">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Run detail</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {detailQuery.isLoading && (
          <p className="p-6 text-sm text-gray-500 dark:text-neutral-400">Loading…</p>
        )}
        {detailQuery.isError && (
          <p className="p-6 text-sm text-red-600 dark:text-red-400">Failed to load run.</p>
        )}

        {detailQuery.data && (
          <div className="space-y-4 p-4">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                  Summary
                </span>
                <RunStatusBadge status={detailQuery.data.run.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500 dark:text-neutral-400">Started</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDateTime(detailQuery.data.run.startedAt)}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Finished</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detailQuery.data.run.finishedAt
                    ? formatDateTime(detailQuery.data.run.finishedAt)
                    : "(still running)"}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Duration</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDurationMs(detailQuery.data.run.durationMs)}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Admin</dt>
                <dd className="text-gray-900 dark:text-white">{detailQuery.data.run.adminName}</dd>
                <dt className="text-gray-500 dark:text-neutral-400">Revenue</dt>
                <dd className="font-semibold text-gray-900 dark:text-white">
                  {formatCents(detailQuery.data.run.totals.revenueCents)}
                </dd>
                <dt className="self-start text-gray-500 dark:text-neutral-400">Attempts</dt>
                <dd>
                  <AttemptsBreakdown
                    size="block"
                    total={detailQuery.data.run.totals.attempted}
                    succeeded={detailQuery.data.run.totals.succeeded}
                    failed={detailQuery.data.run.totals.failed}
                    skipped={detailQuery.data.run.totals.skipped.total}
                    eligibleHint={detailQuery.data.run.totals.eligibleCount}
                  />
                </dd>
              </dl>

              <div className="mt-4 border-t border-gray-200 pt-3 dark:border-neutral-800">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                  Skip breakdown
                </div>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-neutral-300">
                  {SKIP_BUCKET_ORDER.filter((k) => skipBreakdown[k] > 0).map((k) => (
                    <li key={k} className="flex justify-between">
                      <span>
                        {SKIP_BUCKET_LABELS[k]}
                        {k === "noHeldDraft" && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-neutral-500">
                            · self-heals next cycle
                          </span>
                        )}
                        {k === "awaitingRetry" && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-neutral-500">
                            · Stripe auto-retries
                          </span>
                        )}
                      </span>
                      <span className="font-medium">{skipBreakdown[k]}</span>
                    </li>
                  ))}
                  {SKIP_BUCKET_ORDER.every((k) => skipBreakdown[k] === 0) && (
                    <li className="text-gray-400 dark:text-neutral-500">No skips</li>
                  )}
                </ul>
              </div>

              {declineBreakdown.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-3 dark:border-neutral-800">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                      Why charges declined
                    </span>
                    {declineFilter && (
                      <button
                        type="button"
                        onClick={() => setDeclineFilter(null)}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {declineBreakdown.map(([code, count]) => {
                      const on = declineFilter === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setDeclineFilter(on ? null : code)}
                          aria-pressed={on}
                          title={`Filter to ${count} user(s) with ${code}`}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
                            on
                              ? "bg-red-100 text-red-800 ring-red-300 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800"
                              : "bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:bg-neutral-700"
                          }`}
                        >
                          <span className="font-mono">{code}</span>
                          <span className="tabular-nums opacity-70">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Per-invoice attempts
                </h4>
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label="Filter by attempt status"
                  >
                    {STATUS_FILTERS.map((f) => {
                      const on = activeStatuses.has(f.value);
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => toggleStatus(f.value)}
                          aria-pressed={on}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors ${
                            on
                              ? f.active
                              : "bg-transparent text-gray-400 ring-gray-300 hover:text-gray-600 dark:text-neutral-500 dark:ring-neutral-700 dark:hover:text-neutral-300"
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by email…"
                      className="w-44 rounded-md border border-gray-300 bg-white py-1 pl-7 pr-2 text-xs text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-neutral-400">
                    {groupedAttempts.length} users
                    {activeStatuses.size === 0 && " (no status filter)"}
                    {declineFilter && (
                      <>
                        {" · "}
                        <span className="font-mono text-red-600 dark:text-red-400">{declineFilter}</span>
                      </>
                    )}
                  </span>
                  {selectableItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkModalOpen(true)}
                      disabled={selectedItems.length === 0}
                      className="rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed text-white px-3 py-1 text-xs font-semibold dark:bg-amber-600 dark:hover:bg-amber-700"
                      title={
                        selectedItems.length === 0
                          ? "Select one or more stranded rows below"
                          : `Void + re-bill ${selectedItems.length} stranded invoice(s)`
                      }
                    >
                      Recover selected ({selectedItems.length})
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-neutral-700">
                      <th className="bg-gray-50 px-3 py-3 dark:bg-neutral-800 w-8" />
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">User</th>
                      <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Attempts</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Latest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                    {groupedAttempts.map((g) => {
                      const key = groupKey(g);
                      const isExpanded = expandedKeys.has(key);
                      return (
                        <Fragment key={key}>
                          <tr
                            onClick={() => toggleGroup(key)}
                            className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                          >
                            <td className="px-3 py-3">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                              <ClickableUserDisplay
                                displayText={g.userEmail || g.userId || "(unknown)"}
                                userId={g.userId ?? undefined}
                                className="text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <AttemptsBreakdown
                                size="cell"
                                total={g.attempts.length}
                                succeeded={g.successCount}
                                failed={g.failedCount}
                                skipped={g.skippedCount}
                              />
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <RetryStatusBadge status={g.latestStatus} />
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50/60 dark:bg-neutral-800/40">
                              <td colSpan={4} className="px-4 py-3">
                                <table className="w-full">
                                  <thead>
                                    <tr>
                                      <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500 w-8"></th>
                                      <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">Invoice</th>
                                      <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">Status</th>
                                      <th className="px-2 py-2 text-right text-2xs uppercase text-gray-500">Amount</th>
                                      <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">Error</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.attempts.map((r) => {
                                      const isStranded =
                                        r.status === "failed" &&
                                        isStrandedError(r.errorMessage, r.errorCode);
                                      const isSelectable = isStranded && !!g.userId;
                                      const key = g.userId ? `${g.userId}__${r.invoiceId}` : "";
                                      const checked = key ? selectedKeys.has(key) : false;
                                      return (
                                        <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                                          <td className="px-2 py-2 align-middle">
                                            <input
                                              type="checkbox"
                                              disabled={!isSelectable}
                                              checked={checked}
                                              onChange={() => {
                                                if (isSelectable && g.userId) {
                                                  toggleRow(g.userId, r.invoiceId);
                                                }
                                              }}
                                              aria-label={`Select invoice ${r.invoiceId} for bulk recover`}
                                              title={
                                                !g.userId
                                                  ? "Cannot recover — row has no userId"
                                                  : !isStranded
                                                    ? "Only stranded failures are recoverable"
                                                    : "Select for bulk recover"
                                              }
                                              className="h-3.5 w-3.5 disabled:opacity-30"
                                            />
                                          </td>
                                          <td className="px-2 py-2 font-mono text-xs text-gray-700 dark:text-neutral-300">
                                            {r.invoiceId}
                                          </td>
                                          <td className="px-2 py-2 text-xs">
                                            <RetryStatusBadge status={r.status} />
                                          </td>
                                          <td className="px-2 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">
                                            {formatCents(r.amount)}
                                          </td>
                                          <td className="px-2 py-2 text-xs text-red-700 dark:text-red-400">
                                            {r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        {bulkModalOpen && selectedItems.length > 0 && (
          <BulkRecoverInvoicesModal
            isOpen={true}
            onClose={() => setBulkModalOpen(false)}
            items={selectedItems}
            onCompleted={() => {
              setSelectedKeys(new Set());
              queryClient.invalidateQueries({
                queryKey: ["admin", "charge-past-due", "run", runId],
              });
            }}
          />
        )}
      </aside>
    </>
  );
}
