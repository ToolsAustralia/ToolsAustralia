"use client";

import { useState, useRef } from "react";
import { AlertTriangle, CheckCircle, RefreshCw, XCircle, Loader2, X, Copy } from "lucide-react";

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

/** Per-batch cap the server enforces (recover-stranded MAX_LIMIT). */
const BATCH_SIZE = 30;
/** Safety ceiling on auto-loop iterations so a never-draining scan can't spin forever. */
const MAX_ITERATIONS = 60;

interface RecoverProgress {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  revenueCents: number;
  iterations: number;
  target: number;
  rows: StrandedRunRow[];
}

export default function RecoverStrandedPanel() {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [preview, setPreview] = useState<StrandedPreviewData | null>(null);
  const [runResult, setRunResult] = useState<StrandedRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [progress, setProgress] = useState<RecoverProgress | null>(null);
  const [inspector, setInspector] = useState<"recoverable" | "blocked" | null>(null);
  const stoppedRef = useRef(false);

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

  /**
   * Drain ALL recoverable members automatically. Each POST re-scans live and
   * recovers up to BATCH_SIZE (the server is idempotent — a recovered member
   * drops from the next scan), so we loop until a batch recovers nothing, the
   * admin stops, or the safety ceiling is hit. No re-clicking required.
   */
  const handleRecover = async () => {
    if (confirmation !== "RECOVER") return;

    stoppedRef.current = false;
    setPanelState("running");
    setError(null);

    const acc: RecoverProgress = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      revenueCents: 0,
      iterations: 0,
      target: preview?.totals.recoverable ?? 0,
      rows: [],
    };
    setProgress({ ...acc });

    try {
      while (!stoppedRef.current && acc.iterations < MAX_ITERATIONS) {
        const res = await fetch("/api/admin/invoices/recover-stranded", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "RECOVER", limit: BATCH_SIZE }),
        });

        // A batch can take a while; a timeout/proxy may return non-JSON. Parse defensively.
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
              : "A recovery batch timed out — some members may have been recovered in the background. Wait ~30s, click Preview to see who's left, then run again."
          );
          // Keep whatever progress we accumulated visible.
          setPanelState(acc.iterations > 0 ? "done" : "error");
          if (acc.iterations > 0) finalizeRun(acc);
          return;
        }

        if (res.status === 409) {
          setError(data.message ?? data.error ?? "A recover/charge run is already in progress. Try again shortly.");
          setPanelState(acc.iterations > 0 ? "done" : "preview-ready");
          if (acc.iterations > 0) finalizeRun(acc);
          return;
        }

        if (res.status === 400) {
          setError(data.message ?? data.error ?? "Bad request — confirmation may be incorrect.");
          setPanelState("preview-ready");
          return;
        }

        if (!res.ok || !data.success) {
          setError(data.message ?? data.error ?? `Request failed (${res.status})`);
          setPanelState(acc.iterations > 0 ? "done" : "error");
          if (acc.iterations > 0) finalizeRun(acc);
          return;
        }

        // Accumulate this batch.
        acc.iterations += 1;
        acc.attempted += data.attempted;
        acc.succeeded += data.succeeded;
        acc.failed += data.failed;
        acc.skipped += data.skipped;
        acc.revenueCents += data.revenueCents;
        acc.rows.push(...data.rows);
        setProgress({ ...acc });

        // Drained: a batch that attempted nothing means the live scan found no
        // more recoverable members.
        if (data.attempted === 0) break;
      }

      finalizeRun(acc);
      setPanelState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recover run failed");
      setPanelState(acc.iterations > 0 ? "done" : "error");
      if (acc.iterations > 0) finalizeRun(acc);
    }
  };

  /** Roll accumulated batches into the single result shape the "done" view renders. */
  const finalizeRun = (acc: RecoverProgress) => {
    setRunResult({
      success: true,
      chargeRunId: `${acc.iterations} batch${acc.iterations === 1 ? "" : "es"}`,
      attempted: acc.attempted,
      succeeded: acc.succeeded,
      failed: acc.failed,
      skipped: acc.skipped,
      revenueCents: acc.revenueCents,
      rows: acc.rows,
    });
  };

  const handleStop = () => {
    stoppedRef.current = true;
  };

  // ── Reset ─────────────────────────────────────────────────────────────────────

  const handleReset = () => {
    stoppedRef.current = false;
    setPanelState("idle");
    setPreview(null);
    setRunResult(null);
    setError(null);
    setConfirmation("");
    setProgress(null);
    setInspector(null);
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

        {/* Running state — live auto-loop progress */}
        {panelState === "running" && progress && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
              <p className="text-sm font-medium text-gray-800 dark:text-neutral-100">
                Recovering… {progress.succeeded} recovered{progress.target > 0 ? ` of ~${progress.target}` : ""} (batch {progress.iterations})
              </p>
            </div>
            {progress.target > 0 && (
              <div className="w-full bg-gray-200 dark:bg-neutral-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-amber-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round((progress.succeeded / progress.target) * 100))}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg p-3 bg-emerald-50 dark:bg-emerald-950/20">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Recovered</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{progress.succeeded}</p>
              </div>
              <div className="rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
                <p className="text-xs text-red-600 dark:text-red-400">Failed</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{progress.failed}</p>
              </div>
              <div className="rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs text-amber-600 dark:text-amber-400">Skipped</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{progress.skipped}</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-600 dark:text-neutral-400">
              Collected so far: <span className="font-semibold">{formatCents(progress.revenueCents)}</span>
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleStop}
                disabled={stoppedRef.current}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {stoppedRef.current ? "Stopping after this batch…" : "Stop"}
              </button>
            </div>
            <p className="text-center text-xs text-gray-500 dark:text-neutral-500">
              Draining all recoverable members in batches of {BATCH_SIZE}. Stopping is safe — recovered members aren&apos;t touched again.
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
              <button
                type="button"
                onClick={() => preview.recoverable.length > 0 && setInspector("recoverable")}
                disabled={preview.recoverable.length === 0}
                className="text-left rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-3 transition-all enabled:hover:ring-2 enabled:hover:ring-emerald-400 dark:enabled:hover:ring-emerald-600 enabled:cursor-pointer disabled:cursor-default"
                title={preview.recoverable.length > 0 ? "View recoverable members" : undefined}
              >
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Recoverable{preview.recoverable.length > 0 ? " ›" : ""}</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{preview.totals.recoverable}</p>
              </button>
              <button
                type="button"
                onClick={() => preview.blockedNoDraft.length > 0 && setInspector("blocked")}
                disabled={preview.blockedNoDraft.length === 0}
                className="text-left rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-3 transition-all enabled:hover:ring-2 enabled:hover:ring-red-400 dark:enabled:hover:ring-red-600 enabled:cursor-pointer disabled:cursor-default"
                title={preview.blockedNoDraft.length > 0 ? "View blocked members" : undefined}
              >
                <p className="text-xs text-red-600 dark:text-red-400">Blocked (no draft){preview.blockedNoDraft.length > 0 ? " ›" : ""}</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{preview.totals.blockedNoDraft}</p>
              </button>
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
                      This voids stale invoices and charges the current billing cycle for{" "}
                      <strong>all {preview.totals.recoverable}</strong> recoverable member
                      {preview.totals.recoverable === 1 ? "" : "s"}, automatically in batches of {BATCH_SIZE}.
                      Stripe charges are real. You can stop anytime.
                    </p>
                  </div>
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
                  Recover all {preview.totals.recoverable}
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

      {/* Inspector popup — list recoverable or blocked members */}
      {inspector && preview && (
        <StrandedMembersInspector
          variant={inspector}
          rows={inspector === "recoverable" ? preview.recoverable : preview.blockedNoDraft}
          onClose={() => setInspector(null)}
        />
      )}
    </div>
  );
}

// ── Inspector popup ─────────────────────────────────────────────────────────────

function StrandedMembersInspector({
  variant,
  rows,
  onClose,
}: {
  variant: "recoverable" | "blocked";
  rows: StrandedPreviewRow[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isRecoverable = variant === "recoverable";
  const emails = rows.map((r) => r.email).filter(Boolean);

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-neutral-900 dark:border dark:border-neutral-800 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-3xl mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-neutral-700">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-neutral-100">
              {isRecoverable ? "Recoverable members" : "Blocked members (no draft)"} ({rows.length})
            </h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
              {isRecoverable
                ? "Have a held draft and can be auto-recovered (void stale opens → finalize & charge the current cycle)."
                : "Past-due with no held draft to re-bill. These cannot be auto-recovered here — they need manual intervention (e.g. a card-update prompt). They are still attempted by “Charge Past Due” if they have an open invoice with a saved card."}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-2 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-xs text-gray-500 dark:text-neutral-400">{emails.length} email{emails.length === 1 ? "" : "s"}</span>
          <button
            type="button"
            onClick={() => void copyEmails()}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied!" : "Copy emails"}
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Email</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Subscription</th>
                <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Amount</th>
                <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">
                  {isRecoverable ? "Stale opens to void" : "Classification"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
              {rows.map((row) => (
                <tr key={row.userId} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                  <td className="px-3 py-2 text-gray-900 dark:text-neutral-100">{row.email || "—"}</td>
                  <td className="px-3 py-2 font-mono text-gray-700 dark:text-neutral-300">{shortId(row.subscriptionId, 16)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">{formatCents(row.amountCents)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-neutral-300">
                    {isRecoverable ? row.staleOpenIds.length : row.classification}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
