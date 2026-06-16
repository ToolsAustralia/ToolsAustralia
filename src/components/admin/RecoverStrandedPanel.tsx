"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, RefreshCw, XCircle, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StrandedPreviewRow {
  userId: string;
  email: string;
  customerId: string;
  subscriptionId: string;
  classification: string;
  currentDraftId: string | null;
  staleOpenIds: string[];
  supersededDraftIds: string[];
  amountCents: number;
}

interface StrandedPreviewTotals {
  recoverable: number;
  blockedNoDraft: number;
  scanned: number;
  recoverableRevenueCents: number;
}

interface StrandedPreviewData {
  recoverable: StrandedPreviewRow[];
  blockedNoDraft: StrandedPreviewRow[];
  totals: StrandedPreviewTotals;
}

interface StrandedPreviewResponse {
  success: boolean;
  preview: StrandedPreviewData;
  error?: string;
  message?: string;
}

interface StrandedRunRow {
  invoiceId: string;
  customerId: string;
  userId?: string;
  userEmail?: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  skipReason?: string;
  amount?: number;
  subscriptionId?: string;
}

interface StrandedRunResponse {
  success: boolean;
  chargeRunId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  revenueCents: number;
  rows: StrandedRunRow[];
  error?: string;
  message?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function shortId(id: string, len = 18): string {
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

function StatusBadge({ status }: { status: "success" | "failed" | "skipped" }) {
  const styles = {
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    skipped: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type PanelState = "idle" | "previewing" | "preview-ready" | "running" | "done" | "error";

export default function RecoverStrandedPanel() {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [preview, setPreview] = useState<StrandedPreviewData | null>(null);
  const [runResult, setRunResult] = useState<StrandedRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [confirmation, setConfirmation] = useState("");

  // ── Preview ──────────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    setPanelState("previewing");
    setPreview(null);
    setRunResult(null);
    setError(null);
    setConfirmation("");

    try {
      const res = await fetch("/api/admin/invoices/recover-stranded", {
        credentials: "include",
      });
      const data: StrandedPreviewResponse = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message ?? data.error ?? `Request failed (${res.status})`);
        setPanelState("error");
        return;
      }

      setPreview(data.preview);
      setPanelState("preview-ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
      setPanelState("error");
    }
  };

  // ── Execute ──────────────────────────────────────────────────────────────────

  const handleRecover = async () => {
    if (confirmation !== "RECOVER") return;

    setPanelState("running");
    setError(null);

    try {
      const res = await fetch("/api/admin/invoices/recover-stranded", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RECOVER", limit }),
      });

      // The run can take a while; if Vercel times it out (or a proxy returns a non-JSON error
      // page) a bare res.json() would throw "Unexpected token". Read the body as text and parse
      // defensively so a timeout surfaces a real message and the status branches still work.
      const rawBody = await res.text();
      let data: StrandedRunResponse | null = null;
      try {
        data = rawBody ? (JSON.parse(rawBody) as StrandedRunResponse) : null;
      } catch {
        data = null;
      }

      if (!data) {
        setError(
          res.ok
            ? `Unexpected (non-JSON) response from the server (status ${res.status}).`
            : "The recovery run took too long and timed out — some members may have been recovered in the background. Wait ~30s, click Preview to see who's left, then run a smaller batch (≤30 at a time)."
        );
        setPanelState("error");
        return;
      }

      if (res.status === 409) {
        setError(data.message ?? data.error ?? "A recover run is already in progress. Try again shortly.");
        setPanelState("preview-ready");
        return;
      }

      if (res.status === 400) {
        setError(data.message ?? data.error ?? "Bad request — confirmation may be incorrect.");
        setPanelState("preview-ready");
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.message ?? data.error ?? `Request failed (${res.status})`);
        setPanelState("error");
        return;
      }

      setRunResult(data);
      setPanelState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recover run failed");
      setPanelState("error");
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setPanelState("idle");
    setPreview(null);
    setRunResult(null);
    setError(null);
    setConfirmation("");
    setLimit(20);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const isRecoverDisabled =
    confirmation !== "RECOVER" || panelState === "running" || (preview?.totals.recoverable ?? 0) === 0;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Bulk Stranded-Invoice Recovery
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {(panelState === "preview-ready" || panelState === "done" || panelState === "error") && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <RefreshCw className="h-3 w-3" />
              Reset
            </button>
          )}
          {panelState === "idle" || panelState === "error" ? (
            <button
              type="button"
              onClick={() => void handlePreview()}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Preview Stranded
            </button>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">

        {/* Loading state */}
        {panelState === "previewing" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-neutral-400">Scanning Stripe invoices…</p>
          </div>
        )}

        {/* Running state */}
        {panelState === "running" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm text-gray-600 dark:text-neutral-300">
              Voiding stale invoices and charging current cycle…
            </p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/60 dark:bg-red-950/40">
            <XCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">Error</p>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Preview results */}
        {(panelState === "preview-ready" || panelState === "done") && preview && (
          <>
            {/* Totals summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 p-3">
                <p className="text-xs text-gray-500 dark:text-neutral-400">Scanned</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{preview.totals.scanned}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Recoverable</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{preview.totals.recoverable}</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-3">
                <p className="text-xs text-red-600 dark:text-red-400">Blocked (no draft)</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{preview.totals.blockedNoDraft}</p>
              </div>
              <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 p-3">
                <p className="text-xs text-purple-600 dark:text-purple-400">Revenue at stake</p>
                <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                  {formatCents(preview.totals.recoverableRevenueCents)}
                </p>
              </div>
            </div>

            {/* Blocked-no-draft note */}
            {preview.totals.blockedNoDraft > 0 && (
              <p className="text-xs text-gray-500 dark:text-neutral-400 italic">
                {preview.totals.blockedNoDraft} member
                {preview.totals.blockedNoDraft === 1 ? "" : "s"} cannot be auto-recovered (no held draft exists).
                Manual intervention required for these accounts.
              </p>
            )}

            {/* Recoverable table */}
            {preview.recoverable.length > 0 ? (
              <div className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
                <div className="bg-gray-50 dark:bg-neutral-800/90 px-4 py-2 border-b border-gray-200 dark:border-neutral-700">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Recoverable members ({preview.recoverable.length})
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Email</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Subscription</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Amount</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Stale opens to void</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                      {preview.recoverable.map((row) => (
                        <tr key={row.userId} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                          <td className="px-3 py-2 text-gray-900 dark:text-neutral-100">{row.email}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 dark:text-neutral-300">
                            {shortId(row.subscriptionId, 16)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                            {formatCents(row.amountCents)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-neutral-300">
                            {row.staleOpenIds.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40 p-6 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm text-gray-600 dark:text-neutral-300">No recoverable stranded invoices found.</p>
              </div>
            )}

            {/* Execute controls — only show when there is something to recover and run hasn't completed */}
            {panelState === "preview-ready" && preview.totals.recoverable > 0 && (
              <div className="rounded-lg border-2 border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/25 p-4 space-y-3">
                {/* Destructive warning */}
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                      Destructive action — cannot be undone
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                      This voids stale invoices and charges the current billing cycle for up to{" "}
                      <strong>{limit}</strong> member{limit === 1 ? "" : "s"}. Stripe charges are real.
                    </p>
                  </div>
                </div>

                {/* Limit input */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-red-800 dark:text-red-200 whitespace-nowrap">
                    Member limit:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={limit}
                    onChange={(e) => {
                      const v = Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1));
                      setLimit(v);
                    }}
                    className="w-24 rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-neutral-900 px-2 py-1 text-sm text-gray-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <span className="text-xs text-red-600 dark:text-red-400">(max 30 per run — re-run to drain more)</span>
                </div>

                {/* Confirmation input */}
                <div>
                  <label className="block text-xs font-medium text-red-800 dark:text-red-200 mb-1">
                    Type <strong>RECOVER</strong> to enable the button:
                  </label>
                  <input
                    type="text"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="RECOVER"
                    className="w-full rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm uppercase text-gray-900 dark:text-neutral-100 placeholder:normal-case placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {/* Execute button */}
                <button
                  type="button"
                  onClick={() => void handleRecover()}
                  disabled={isRecoverDisabled}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  Recover {limit}
                </button>
              </div>
            )}
          </>
        )}

        {/* Run result */}
        {panelState === "done" && runResult && (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/25 p-4">
              <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  Recovery run complete
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                  Run ID: <span className="font-mono">{runResult.chargeRunId}</span>
                </p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 p-3">
                <p className="text-xs text-gray-500 dark:text-neutral-400">Attempted</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{runResult.attempted}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Succeeded</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{runResult.succeeded}</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-3">
                <p className="text-xs text-red-600 dark:text-red-400">Failed</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{runResult.failed}</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3">
                <p className="text-xs text-amber-600 dark:text-amber-400">Skipped</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{runResult.skipped}</p>
              </div>
              <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 p-3">
                <p className="text-xs text-purple-600 dark:text-purple-400">Revenue</p>
                <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                  {formatCents(runResult.revenueCents)}
                </p>
              </div>
            </div>

            {/* Per-member rows */}
            {runResult.rows.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
                <div className="bg-gray-50 dark:bg-neutral-800/90 px-4 py-2 border-b border-gray-200 dark:border-neutral-700">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Per-member results
                  </h4>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Email</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Status</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Amount</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                      {runResult.rows.map((row, idx) => (
                        <tr key={`${row.invoiceId}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                          <td className="px-3 py-2 text-gray-900 dark:text-neutral-100">
                            {row.userEmail ?? row.userId ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                            {row.amount !== undefined ? formatCents(row.amount) : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">
                            {row.error ?? row.skipReason ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Idle placeholder */}
        {panelState === "idle" && (
          <p className="text-sm text-gray-500 dark:text-neutral-400 py-2">
            Click <strong>Preview Stranded</strong> to scan for members with Stripe invoices that can no longer be
            paid and are eligible for the void-and-re-bill recovery flow.
          </p>
        )}
      </div>
    </div>
  );
}
