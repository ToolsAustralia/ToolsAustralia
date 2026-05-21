"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, X, XCircle, Loader2 } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";
import { Button } from "../modals/ui";

export interface BulkRecoverItem {
  userId: string;
  userEmail: string;
  originalInvoiceId: string;
  amount?: number;
}

export interface BulkRecoverInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BulkRecoverItem[];
  onCompleted?: () => void;
}

type State = "idle" | "processing" | "completed" | "error";

interface RowResult {
  userId: string;
  originalInvoiceId: string;
  ok: boolean;
  newInvoiceId?: string;
  reason?: string;
  message?: string;
  paymentStatus?: "success" | "failed" | "skipped";
  error?: string;
  amount?: number;
}

interface BulkResponse {
  success: boolean;
  summary?: { total: number; succeeded: number; failed: number };
  results?: RowResult[];
  error?: string;
  message?: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

const BulkRecoverInvoicesModal: React.FC<BulkRecoverInvoicesModalProps> = ({
  isOpen,
  onClose,
  items,
  onCompleted,
}) => {
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<State>("idle");
  const [response, setResponse] = useState<BulkResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");

  useEffect(() => {
    if (isOpen) {
      setConfirmation("");
      setState("idle");
      setResponse(null);
      setStatusFilter("all");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (confirmation !== "RECOVER ALL") return;
    setState("processing");
    try {
      const res = await fetch(`/api/admin/invoices/recover-past-due`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: "RECOVER ALL",
          items: items.map((i) => ({
            userId: i.userId,
            originalInvoiceId: i.originalInvoiceId,
          })),
        }),
      });
      const data: BulkResponse = await res.json();
      setResponse(data);
      setState(data.success ? "completed" : "error");
      if (data.success && onCompleted) onCompleted();
    } catch (err) {
      setResponse({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
      setState("error");
    }
  };

  const handleClose = () => {
    if (state === "processing") return;
    onClose();
  };

  const filteredResults = (response?.results ?? []).filter((r) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "success") return r.ok && r.paymentStatus === "success";
    if (statusFilter === "failed") return !r.ok || r.paymentStatus === "failed";
    return true;
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4"
      style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-neutral-900 dark:border dark:border-neutral-800 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-3xl mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-neutral-100">
                Bulk recover stranded invoices
              </h3>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                {items.length} invoice{items.length === 1 ? "" : "s"} selected
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={state === "processing"}
            className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-200 p-1 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
          {state === "idle" && (
            <>
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
                <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  This will, for each selected invoice:
                </h4>
                <ol className="text-sm text-amber-700 dark:text-amber-300 list-decimal pl-5 space-y-1">
                  <li>Void the dead invoice</li>
                  <li>Use a held draft if one exists, else create a fresh invoice</li>
                  <li>Finalize and attempt one charge against the customer&apos;s saved card</li>
                  <li>On success, clear pause_collection</li>
                </ol>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 italic">
                  Each row is processed sequentially with a small delay. Voiding cannot
                  be undone. Each row is per-user idempotent (24h lock).
                </p>
              </div>

              <div className="border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-neutral-800/90 px-4 py-2 border-b border-gray-200 dark:border-neutral-700">
                  <h5 className="font-semibold text-sm text-gray-700 dark:text-neutral-200">
                    Selected invoices
                  </h5>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">User</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Invoice</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-neutral-400">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                      {items.map((item, idx) => (
                        <tr
                          key={`${item.userId}-${item.originalInvoiceId}-${idx}`}
                          className="hover:bg-gray-50 dark:hover:bg-neutral-800/50"
                        >
                          <td className="px-3 py-2 text-gray-900 dark:text-neutral-100">{item.userEmail}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 dark:text-neutral-300">
                            {item.originalInvoiceId.slice(0, 18)}…
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-neutral-100">
                            {item.amount !== undefined ? formatCurrency(item.amount) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {items.length > 10 && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    <strong>Too many items selected ({items.length}).</strong> Bulk recovery is capped
                    at 10 items per run to fit within the serverless request budget. Deselect at
                    least {items.length - 10} item{items.length - 10 === 1 ? "" : "s"} or run them
                    in batches.
                  </p>
                </div>
              )}

              <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
                <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                  Type <strong>RECOVER ALL</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="RECOVER ALL"
                  className="w-full px-3 py-2 rounded-md text-sm uppercase text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                  autoFocus
                />
              </div>
            </>
          )}

          {state === "processing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600 dark:text-amber-500" />
              <p className="text-gray-700 dark:text-neutral-300 text-sm">
                Processing {items.length} invoice{items.length === 1 ? "" : "s"}…
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Each row takes a few seconds. Do not close this window.
              </p>
            </div>
          )}

          {state === "completed" && response?.summary && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "all"
                      ? "bg-gray-100 dark:bg-neutral-800 ring-2 ring-gray-400 dark:ring-neutral-500"
                      : "bg-gray-50 dark:bg-neutral-900/50 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <div className="text-xs text-gray-600 dark:text-neutral-400">Total</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-neutral-100">
                    {response.summary.total}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("success")}
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "success"
                      ? "bg-green-100 dark:bg-green-950/40 ring-2 ring-green-400 dark:ring-green-600"
                      : "bg-green-50 dark:bg-green-950/20 hover:bg-green-100"
                  }`}
                >
                  <div className="text-xs text-green-700 dark:text-green-400">Succeeded</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300">
                    {response.summary.succeeded}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("failed")}
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "failed"
                      ? "bg-red-100 dark:bg-red-950/40 ring-2 ring-red-400 dark:ring-red-600"
                      : "bg-red-50 dark:bg-red-950/20 hover:bg-red-100"
                  }`}
                >
                  <div className="text-xs text-red-700 dark:text-red-400">Failed</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">
                    {response.summary.failed}
                  </div>
                </button>
              </div>

              <div className="border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-neutral-800/90 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Invoice</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Result</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-neutral-400">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                      {filteredResults.map((r, idx) => (
                        <tr
                          key={`${r.originalInvoiceId}-${idx}`}
                          className="hover:bg-gray-50 dark:hover:bg-neutral-800/50"
                        >
                          <td className="px-3 py-2 font-mono text-gray-700 dark:text-neutral-300">
                            {r.originalInvoiceId.slice(0, 18)}…
                          </td>
                          <td className="px-3 py-2">
                            {r.ok && r.paymentStatus === "success" ? (
                              <span className="text-green-700 dark:text-green-300 font-semibold">
                                Recovered ({r.amount !== undefined ? formatCurrency(r.amount) : "—"})
                              </span>
                            ) : r.ok ? (
                              <span className="text-amber-700 dark:text-amber-300 font-semibold">
                                Recovered, pay {r.paymentStatus}
                              </span>
                            ) : (
                              <span className="text-red-700 dark:text-red-300 font-semibold">Failed</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-neutral-400">
                            {r.ok ? (r.error ?? "—") : (r.message ?? r.reason ?? "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {state === "error" && (
            <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">
                    Bulk recovery failed
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {response?.message ?? response?.error ?? "Unknown error"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 pt-0 border-t border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950/80">
          <Button
            onClick={handleClose}
            variant="secondary"
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-100"
            disabled={state === "processing"}
          >
            {state === "completed" || state === "error" ? "Close" : "Cancel"}
          </Button>
          {state === "idle" && (
            <Button
              onClick={() => void handleSubmit()}
              variant="secondary"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
              disabled={confirmation !== "RECOVER ALL" || items.length > 10}
            >
              Recover {items.length}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkRecoverInvoicesModal;
