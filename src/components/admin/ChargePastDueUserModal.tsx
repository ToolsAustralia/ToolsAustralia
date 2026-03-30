"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, XCircle, CheckCircle, X, Loader2 } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";
import { Button } from "../modals/ui";

export interface ChargePastDueUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Mongo user id for /api/admin/users/[id]/charge-past-due */
  targetUserId: string;
  memberLabel?: string;
  onConfirm: () => Promise<ChargeResponse>;
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

interface ChargeResponse {
  success: boolean;
  summary: {
    totalInvoices: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  results: ChargeResult[];
  error?: string;
  message?: string;
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

const ChargePastDueUserModal: React.FC<ChargePastDueUserModalProps> = ({
  isOpen,
  onClose,
  targetUserId,
  memberLabel,
  onConfirm,
}) => {
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [results, setResults] = useState<ChargeResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "skipped">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    if (!isOpen || !targetUserId) return;

    setConfirmation("");
    setResults(null);
    setPreview(null);
    setError(null);
    setStatusFilter("all");
    setCurrentPage(1);
    setState("loading");

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/admin/users/${targetUserId}/charge-past-due`);
        const data: PreviewResponse = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.message || data.error || `Request failed (${response.status})`);
          setState("error");
          return;
        }
        if (data.success) {
          setPreview(data);
          setState("preview");
        } else {
          setError(data.error || "Failed to load preview");
          setState("error");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load preview");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetUserId]);

  const handleClose = () => {
    if (state === "processing") return;
    setConfirmation("");
    setState("idle");
    setResults(null);
    setPreview(null);
    setError(null);
    setStatusFilter("all");
    setCurrentPage(1);
    onClose();
  };

  const handleConfirm = async () => {
    if (confirmation !== "CHARGE") return;

    setState("processing");
    setError(null);

    try {
      const response = await onConfirm();
      setResults(response);
      setState("completed");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount / 100);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4"
      style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-2xl mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Charge past due (this member)</h3>
              {memberLabel ? <p className="text-xs text-gray-500 mt-0.5">{memberLabel}</p> : null}
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={state === "processing"}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
              <p className="text-gray-600">Loading preview...</p>
            </div>
          )}

          {state === "preview" && preview && (
            <>
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-800 mb-1">Warning: real card charge</h4>
                    <p className="text-sm text-yellow-700">
                      This retries payment on Stripe open invoices for this member only, using the same rules as the
                      bulk past-due tool.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Preview</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600">Open invoices (this customer):</span>
                    <span className="ml-2 font-bold text-blue-900">{preview.preview.totalInvoices}</span>
                  </div>
                  <div>
                    <span className="text-blue-600">Eligible to charge:</span>
                    <span className="ml-2 font-bold text-blue-900">{preview.preview.eligibleCount}</span>
                  </div>
                </div>
              </div>

              {preview.preview.filterStats && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-800 mb-2 text-sm">Filtered out</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    {preview.preview.filterStats.wrongCollectionMethod > 0 && (
                      <div>Wrong collection method: {preview.preview.filterStats.wrongCollectionMethod}</div>
                    )}
                    {preview.preview.filterStats.noAmountRemaining > 0 && (
                      <div>No amount remaining: {preview.preview.filterStats.noAmountRemaining}</div>
                    )}
                    {preview.preview.filterStats.noPaymentMethod > 0 && (
                      <div>No payment method: {preview.preview.filterStats.noPaymentMethod}</div>
                    )}
                    {preview.preview.filterStats.noCustomerId > 0 && (
                      <div>Customer mismatch: {preview.preview.filterStats.noCustomerId}</div>
                    )}
                    {preview.preview.filterStats.notPastDue > 0 && (
                      <div>Not past_due in DB: {preview.preview.filterStats.notPastDue}</div>
                    )}
                  </div>
                </div>
              )}

              {preview.preview.users.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <h5 className="font-semibold text-sm text-gray-700">Invoice(s) to charge</h5>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-600">Invoice</th>
                          <th className="px-3 py-2 text-right text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.preview.users.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono">{row.invoiceId.slice(0, 18)}…</td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.preview.users.length === 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-gray-600">No eligible invoices to charge for this member.</p>
                </div>
              )}

              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <label className="block text-sm font-medium text-red-800 mb-2">
                  Type <strong>CHARGE</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="CHARGE"
                  className="w-full px-3 py-2 border border-red-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
                  autoFocus
                />
              </div>
            </>
          )}

          {state === "processing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
              <p className="text-gray-600">Processing charge...</p>
            </div>
          )}

          {state === "completed" && results && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-green-800">Complete</h4>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <button
                  type="button"
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "all" ? "bg-gray-100 ring-2 ring-gray-400" : "bg-gray-50 hover:bg-gray-100"
                  }`}
                  onClick={() => {
                    setStatusFilter("all");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-gray-600">Open invoices</div>
                  <div className="text-lg font-bold text-gray-900">{results.summary.totalInvoices}</div>
                </button>
                <button
                  type="button"
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "success" ? "bg-green-100 ring-2 ring-green-400" : "bg-green-50 hover:bg-green-100"
                  }`}
                  onClick={() => {
                    setStatusFilter("success");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-green-600">Succeeded</div>
                  <div className="text-lg font-bold text-green-700">{results.summary.succeeded}</div>
                </button>
                <button
                  type="button"
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "failed" ? "bg-red-100 ring-2 ring-red-400" : "bg-red-50 hover:bg-red-100"
                  }`}
                  onClick={() => {
                    setStatusFilter("failed");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-red-600">Failed</div>
                  <div className="text-lg font-bold text-red-700">{results.summary.failed}</div>
                </button>
                <button
                  type="button"
                  className={`rounded-lg p-3 text-left transition-all ${
                    statusFilter === "skipped"
                      ? "bg-yellow-100 ring-2 ring-yellow-400"
                      : "bg-yellow-50 hover:bg-yellow-100"
                  }`}
                  onClick={() => {
                    setStatusFilter("skipped");
                    setCurrentPage(1);
                  }}
                >
                  <div className="text-xs text-yellow-600">Skipped</div>
                  <div className="text-lg font-bold text-yellow-700">{results.summary.skipped}</div>
                </button>
              </div>

              {results.results.length > 0 && (() => {
                const filteredResults = results.results.filter(
                  (result) => statusFilter === "all" || result.status === statusFilter
                );
                const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const paginatedResults = filteredResults.slice(startIndex, endIndex);

                return (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                      <h5 className="font-semibold text-sm text-gray-700">Results</h5>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-600">Invoice</th>
                            <th className="px-3 py-2 text-left text-gray-600">Status</th>
                            <th className="px-3 py-2 text-right text-gray-600">Amount</th>
                            <th className="px-3 py-2 text-left text-gray-600">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {paginatedResults.length > 0 ? (
                            paginatedResults.map((result, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono">
                                  {result.invoiceId ? `${result.invoiceId.slice(0, 12)}…` : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-medium ${
                                      result.status === "success"
                                        ? "bg-green-100 text-green-700"
                                        : result.status === "failed"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-yellow-100 text-yellow-700"
                                    }`}
                                  >
                                    {result.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {result.amount ? formatCurrency(result.amount) : "-"}
                                </td>
                                <td className="px-3 py-2 text-gray-600 text-xs">
                                  {result.error || result.skipReason || "-"}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="px-3 py-4 text-center text-gray-500 text-xs">
                                No rows for this filter
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="bg-gray-50 px-4 py-2 border-t flex items-center justify-between">
                        <div className="text-xs text-gray-600">
                          {startIndex + 1}-{Math.min(endIndex, filteredResults.length)} of {filteredResults.length}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-xs border rounded disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <span className="px-3 py-1 text-xs text-gray-600">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-xs border rounded disabled:opacity-50"
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800 mb-1">Error</h4>
                  <p className="text-sm text-red-700">{error || "Something went wrong"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 pt-0 border-t border-gray-200">
          <Button onClick={handleClose} variant="secondary" className="flex-1" disabled={state === "processing"}>
            {state === "completed" ? "Close" : "Cancel"}
          </Button>
          {state === "preview" && (
            <Button
              onClick={() => void handleConfirm()}
              variant="secondary"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              disabled={confirmation !== "CHARGE" || preview?.preview.eligibleCount === 0}
            >
              Confirm charge ({preview?.preview.eligibleCount ?? 0})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChargePastDueUserModal;
