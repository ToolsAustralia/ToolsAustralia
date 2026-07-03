"use client";

import React, { useState, useEffect, useRef } from "react";
import { AlertTriangle, XCircle, CheckCircle, X, Loader2 } from "lucide-react";
import { Button } from "../modals/ui";
import { ChargeJobResultStatusBadge } from "@/components/admin/ui/AdminBadge";

export interface ChargePastDueModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once a run finishes (or is stopped) so the caller can refresh the user list. */
  onCompleted?: () => void;
}

type ModalState = "idle" | "loading" | "preview" | "processing" | "completed" | "error";

interface ChargeResult {
  invoiceId: string;
  customerId: string;
  userId?: string;
  userEmail?: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  amount?: number;
  skipReason?: string;
}

interface ChargeSummary {
  totalInvoices: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

interface PreviewUser {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  currency: string;
}

interface PreviewResponse {
  success: boolean;
  preview: {
    eligibleCount: number;
    totalInvoices: number;
    filterStats: {
      wrongCollectionMethod: number;
      noAmountRemaining: number;
      noPaymentMethod: number;
      noCustomerId: number;
      userNotFound: number;
      notPastDue: number;
    };
    debug: {
      totalCustomerIds: number;
      totalUsersFound: number;
      pastDueUsersFound: number;
    };
    users: PreviewUser[];
  };
  error?: string;
  message?: string;
}

interface RunTotals {
  eligibleCount: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: { total: number };
  revenueCents: number;
}

interface ChunkResponse {
  success: boolean;
  runId: string;
  total: number;
  processed: number;
  processedThisChunk: number;
  done: boolean;
  totals: RunTotals;
  error?: string;
  message?: string;
}

interface StartResponse {
  success: boolean;
  runId: string;
  total: number;
  done: boolean;
  error?: string;
  message?: string;
  allowlist?: {
    evaluated: number;
    added: number;
    alreadyAllowlisted: number;
    skipped: { fraud: number; permanent: number; notMember: number };
    errored: number;
  };
}

interface LiveProgress {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  revenueCents: number;
}

const ENDPOINT = "/api/admin/invoices/charge-past-due";

const ChargePastDueModal: React.FC<ChargePastDueModalProps> = ({ isOpen, onClose, onCompleted }) => {
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [results, setResults] = useState<{ summary: ChargeSummary; results: ChargeResult[] } | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [allowlistSummary, setAllowlistSummary] = useState<StartResponse["allowlist"] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "skipped">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const runIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  // Fetch preview when modal opens
  useEffect(() => {
    if (isOpen && state === "idle") {
      fetchPreview();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPreview = async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch(ENDPOINT);
      const data: PreviewResponse = await response.json();
      if (data.success) {
        setPreview(data);
        setState("preview");
      } else {
        setError(data.error || "Failed to load preview");
        setState("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
      setState("error");
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || `Request failed (${res.status})`);
    }
    return data;
  };

  /** After a run finishes/stops, pull the per-invoice rows + totals for the results table. */
  const loadRunResults = async (runId: string) => {
    try {
      const res = await fetch(`/api/admin/charge-past-due/runs/${runId}`);
      if (!res.ok) return;
      const detail = await res.json();
      const totals: RunTotals = detail.run?.totals;
      const rows: Array<{
        invoiceId: string;
        userEmail: string;
        status: "success" | "failed" | "skipped";
        amount: number;
        errorMessage?: string;
        declineCode?: string;
        errorCode?: string;
      }> = detail.rows ?? [];
      setResults({
        summary: {
          totalInvoices: totals?.eligibleCount ?? rows.length,
          processed: totals?.attempted ?? 0,
          succeeded: totals?.succeeded ?? 0,
          failed: totals?.failed ?? 0,
          skipped: totals?.skipped?.total ?? 0,
        },
        results: rows.map((r) => ({
          invoiceId: r.invoiceId,
          customerId: "",
          userEmail: r.userEmail,
          status: r.status,
          amount: r.amount,
          error: r.status === "failed" ? r.declineCode || r.errorCode || r.errorMessage : undefined,
          skipReason: r.status === "skipped" ? r.errorMessage : undefined,
        })),
      });
    } catch {
      /* non-fatal — summary still shows from progress */
    }
  };

  const handleConfirm = async () => {
    if (confirmation !== "CHARGE") return;

    setState("processing");
    setError(null);
    stoppedRef.current = false;
    runIdRef.current = null;
    setProgress({
      processed: 0,
      total: preview?.preview.eligibleCount ?? 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      revenueCents: 0,
    });

    try {
      const start: StartResponse = await post({ action: "start", confirmation: "CHARGE" });
      runIdRef.current = start.runId;
      setAllowlistSummary(start.allowlist ?? null);
      setProgress((p) => (p ? { ...p, total: start.total } : p));

      let done = start.done;
      let lastProcessed = -1;
      let stalls = 0;
      while (!done && !stoppedRef.current) {
        const chunk: ChunkResponse = await post({ action: "chunk", runId: start.runId });
        setProgress({
          processed: chunk.processed,
          total: chunk.total,
          succeeded: chunk.totals.succeeded,
          failed: chunk.totals.failed,
          skipped: chunk.totals.skipped.total,
          revenueCents: chunk.totals.revenueCents,
        });
        done = chunk.done;
        // Defense-in-depth: if progress stops advancing across two chunks, stop
        // rather than loop forever (the engine guarantees every item writes a row,
        // so this should never trigger — but a regression must not hang the UI).
        if (!done) {
          if (chunk.processed <= lastProcessed) {
            if (++stalls >= 2) {
              await post({ action: "abort", runId: start.runId }).catch(() => undefined);
              break;
            }
          } else {
            stalls = 0;
          }
          lastProcessed = chunk.processed;
        }
      }

      // If the admin stopped early, finalize + release the lock so a re-run can start now.
      if (!done && stoppedRef.current) {
        await post({ action: "abort", runId: start.runId }).catch(() => undefined);
      }

      await loadRunResults(start.runId);
      setState("completed");
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      // Best-effort: release the lock so the run isn't stuck holding it.
      if (runIdRef.current) await post({ action: "abort", runId: runIdRef.current }).catch(() => undefined);
      setState("error");
    }
  };

  const handleStop = () => {
    stoppedRef.current = true;
  };

  const handleClose = () => {
    if (state === "processing") {
      // Stop the loop; the abort fires inside the loop's finally path.
      stoppedRef.current = true;
      return;
    }
    setConfirmation("");
    setState("idle");
    setResults(null);
    setPreview(null);
    setError(null);
    setProgress(null);
    setAllowlistSummary(null);
    setStatusFilter("all");
    setCurrentPage(1);
    runIdRef.current = null;
    onClose();
  };

  if (!isOpen) return null;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount / 100);

  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={state === "processing" ? undefined : handleClose} />
      <div className="relative bg-white dark:bg-neutral-900 dark:border dark:border-neutral-800 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-2xl mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-neutral-100">Charge Past Due Customers</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={state === "processing"}
            className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors p-1 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-neutral-400" />
              <p className="text-gray-600 dark:text-neutral-400">Loading preview...</p>
            </div>
          )}

          {state === "preview" && preview && (
            <>
              {/* Warning Banner */}
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-200 dark:border-yellow-800/50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">Warning: Real Charges</h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      This will attempt real charges on customer cards. The run is processed in batches and shows
                      live progress — keep this window open until it finishes. Already-charged members are never
                      double-charged (6-hour guard).
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview Summary */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/45 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Preview Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">Total Invoices Found:</span>
                    <span className="ml-2 font-bold text-blue-900 dark:text-blue-100">{preview.preview.totalInvoices}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">Eligible to Charge:</span>
                    <span className="ml-2 font-bold text-blue-900 dark:text-blue-100">{preview.preview.eligibleCount}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">Past Due Users in DB:</span>
                    <span className="ml-2 font-bold text-blue-900 dark:text-blue-100">{preview.preview.debug.pastDueUsersFound}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">Total Users Found:</span>
                    <span className="ml-2 font-bold text-blue-900 dark:text-blue-100">{preview.preview.debug.totalUsersFound}</span>
                  </div>
                </div>
              </div>

              {/* Filter Statistics */}
              {preview.preview.filterStats && (
                <div className="bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-800 dark:text-neutral-100 mb-2 text-sm">Filtered Out:</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-neutral-400">
                    {preview.preview.filterStats.wrongCollectionMethod > 0 && (
                      <div>Wrong collection method: {preview.preview.filterStats.wrongCollectionMethod}</div>
                    )}
                    {preview.preview.filterStats.noAmountRemaining > 0 && (
                      <div>No amount remaining: {preview.preview.filterStats.noAmountRemaining}</div>
                    )}
                    {preview.preview.filterStats.noPaymentMethod > 0 && (
                      <div>No payment method: {preview.preview.filterStats.noPaymentMethod}</div>
                    )}
                    {preview.preview.filterStats.userNotFound > 0 && (
                      <div>User not found: {preview.preview.filterStats.userNotFound}</div>
                    )}
                    {preview.preview.filterStats.notPastDue > 0 && (
                      <div>Not past_due in DB: {preview.preview.filterStats.notPastDue}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Users List */}
              {preview.preview.users.length > 0 && (
                <div className="border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 dark:bg-neutral-800/90 px-4 py-2 border-b border-gray-200 dark:border-neutral-700">
                    <h5 className="font-semibold text-sm text-gray-700 dark:text-neutral-200">
                      Users That Will Be Charged ({preview.preview.users.length})
                    </h5>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">User</th>
                          <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Email</th>
                          <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                        {preview.preview.users.map((user, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                            <td className="px-3 py-2 text-gray-900 dark:text-neutral-100">{user.userName}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-neutral-400">{user.userEmail}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-neutral-100">
                              {formatCurrency(user.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.preview.users.length === 0 && (
                <div className="bg-gray-50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-700 rounded-lg p-4 text-center">
                  <p className="text-gray-600 dark:text-neutral-300">No eligible invoices found to charge.</p>
                </div>
              )}

              {/* Confirmation input */}
              <div className="bg-red-50 dark:bg-red-950/25 rounded-lg p-4 border border-red-200 dark:border-red-900/45">
                <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                  Type <strong>CHARGE</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="CHARGE"
                  className="w-full px-3 py-2 rounded-md text-sm uppercase text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-600"
                  autoFocus
                />
              </div>
            </>
          )}

          {state === "processing" && progress && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-red-600 dark:text-red-500" />
                <p className="text-sm font-medium text-gray-800 dark:text-neutral-100">
                  Charging in batches… {progress.processed} of {progress.total}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 dark:bg-neutral-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-red-600 dark:bg-red-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Live counts */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
                  <div className="text-xs text-green-600 dark:text-green-400">Succeeded</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300">{progress.succeeded}</div>
                </div>
                <div className="rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
                  <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">{progress.failed}</div>
                </div>
                <div className="rounded-lg p-3 bg-yellow-50 dark:bg-yellow-950/20">
                  <div className="text-xs text-yellow-600 dark:text-yellow-400">Skipped</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{progress.skipped}</div>
                </div>
              </div>

              <p className="text-center text-sm text-gray-600 dark:text-neutral-400">
                Collected so far: <span className="font-semibold">{formatCurrency(progress.revenueCents)}</span>
              </p>
              <p className="text-center text-xs text-gray-500 dark:text-neutral-500">
                Keep this window open. You can stop anytime — already-charged members won&apos;t be charged again.
              </p>
            </div>
          )}

          {state === "completed" && results && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-900/45 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h4 className="font-semibold text-green-800 dark:text-green-200">Processing Complete</h4>
                </div>
              </div>

              {allowlistSummary && allowlistSummary.added > 0 && (
                <div className="mb-3 text-sm text-blue-700 dark:text-blue-300">
                  Allowlisted {allowlistSummary.added} previously-blocked{" "}
                  {allowlistSummary.added === 1 ? "card" : "cards"} before charging
                  {allowlistSummary.alreadyAllowlisted > 0
                    ? ` (${allowlistSummary.alreadyAllowlisted} already on the list)`
                    : ""}
                  .
                </div>
              )}

              {/* Summary - Clickable for filtering */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div
                  className={`rounded-lg p-3 cursor-pointer transition-all ${
                    statusFilter === "all"
                      ? "bg-gray-100 dark:bg-neutral-800 ring-2 ring-gray-400 dark:ring-neutral-500"
                      : "bg-gray-50 dark:bg-neutral-900/50 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  }`}
                  onClick={() => {
                    setStatusFilter("all");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-gray-600 dark:text-neutral-400">Eligible</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-neutral-100">{results.summary.totalInvoices}</div>
                </div>
                <div
                  className={`rounded-lg p-3 cursor-pointer transition-all ${
                    statusFilter === "success"
                      ? "bg-green-100 dark:bg-green-950/40 ring-2 ring-green-400 dark:ring-green-600"
                      : "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/35"
                  }`}
                  onClick={() => {
                    setStatusFilter("success");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-green-600 dark:text-green-400">Succeeded</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300">{results.summary.succeeded}</div>
                </div>
                <div
                  className={`rounded-lg p-3 cursor-pointer transition-all ${
                    statusFilter === "failed"
                      ? "bg-red-100 dark:bg-red-950/40 ring-2 ring-red-400 dark:ring-red-600"
                      : "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/35"
                  }`}
                  onClick={() => {
                    setStatusFilter("failed");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">{results.summary.failed}</div>
                </div>
                <div
                  className={`rounded-lg p-3 cursor-pointer transition-all ${
                    statusFilter === "skipped"
                      ? "bg-yellow-100 dark:bg-yellow-950/40 ring-2 ring-yellow-400 dark:ring-yellow-600"
                      : "bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/35"
                  }`}
                  onClick={() => {
                    setStatusFilter("skipped");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-yellow-600 dark:text-yellow-400">Skipped</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{results.summary.skipped}</div>
                </div>
              </div>

              {/* Results table with filtering and pagination */}
              {results.results.length > 0 && (() => {
                const filteredResults = results.results.filter(
                  (result) => statusFilter === "all" || result.status === statusFilter
                );
                const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const paginatedResults = filteredResults.slice(startIndex, endIndex);

                return (
                  <div className="border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-neutral-800/90 px-4 py-2 border-b border-gray-200 dark:border-neutral-700 flex items-center justify-between">
                      <h5 className="font-semibold text-sm text-gray-700 dark:text-neutral-200">
                        Charge Results
                        {statusFilter !== "all" && (
                          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-neutral-500">
                            ({filteredResults.length} {statusFilter})
                          </span>
                        )}
                      </h5>
                      {statusFilter !== "all" && (
                        <button
                          onClick={() => {
                            setStatusFilter("all");
                            setCurrentPage(1);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Invoice</th>
                            <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">User Email</th>
                            <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Status</th>
                            <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Amount</th>
                            <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                          {paginatedResults.length > 0 ? (
                            paginatedResults.map((result, idx) => (
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                                <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-neutral-100">{result.invoiceId.slice(0, 12)}...</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-neutral-400">{result.userEmail || "N/A"}</td>
                                <td className="px-3 py-2">
                                  <ChargeJobResultStatusBadge status={result.status} />
                                </td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-neutral-100">
                                  {result.amount ? formatCurrency(result.amount) : "-"}
                                </td>
                                <td className="px-3 py-2 text-gray-600 dark:text-neutral-400 text-xs">
                                  {result.error || result.skipReason || "-"}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="px-3 py-4 text-center text-gray-500 dark:text-neutral-500 text-xs">
                                No {statusFilter !== "all" ? statusFilter : ""} results found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="bg-gray-50/90 dark:bg-neutral-950/80 px-4 py-2 border-t border-gray-200 dark:border-neutral-800 flex items-center justify-between">
                        <div className="text-xs text-gray-600 dark:text-neutral-300">
                          Showing {startIndex + 1}-{Math.min(endIndex, filteredResults.length)} of {filteredResults.length} results
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-neutral-800"
                          >
                            Previous
                          </button>
                          <span className="px-3 py-1 text-xs text-gray-600 dark:text-neutral-300">
                            Page {currentPage} of {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-neutral-800"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {state === "error" && (
            <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">Error</h4>
                  <p className="text-sm text-red-700 dark:text-red-300">{error || "An error occurred while processing charges"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 pt-0 border-t border-gray-200 dark:border-neutral-800 bg-gray-50/80 dark:bg-neutral-950/80">
          {state === "processing" ? (
            <Button
              onClick={handleStop}
              variant="secondary"
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-100"
              disabled={stoppedRef.current}
            >
              {stoppedRef.current ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button onClick={handleClose} variant="secondary" className="flex-1">
              {state === "completed" ? "Close" : "Cancel"}
            </Button>
          )}
          {state === "preview" && (
            <Button
              onClick={handleConfirm}
              variant="secondary"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              disabled={confirmation !== "CHARGE" || preview?.preview.eligibleCount === 0}
            >
              Confirm Charge ({preview?.preview.eligibleCount || 0})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChargePastDueModal;
