"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, X, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";
import { Button } from "../modals/ui";

export interface RecoverInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  originalInvoiceId: string;
  /** Cents – display only; server re-derives from package */
  expectedAmountCents?: number;
  onRecovered?: () => void;
}

type State = "idle" | "processing" | "success" | "error";

interface RecoverResponse {
  success: boolean;
  newInvoiceId?: string;
  row?: {
    invoiceId: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    amount?: number;
    skipReason?: string;
    resumeCollectionError?: string;
  };
  reason?: string;
  message?: string;
  error?: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

const RecoverInvoiceModal: React.FC<RecoverInvoiceModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  originalInvoiceId,
  expectedAmountCents,
  onRecovered,
}) => {
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<State>("idle");
  const [response, setResponse] = useState<RecoverResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmation("");
      setState("idle");
      setResponse(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (confirmation !== "RECOVER") return;
    setState("processing");
    try {
      const res = await fetch(`/api/admin/users/${userId}/recover-past-due-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RECOVER", originalInvoiceId }),
      });
      const data: RecoverResponse = await res.json();
      setResponse(data);
      setState(data.success ? "success" : "error");
      if (data.success && onRecovered) onRecovered();
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4"
      style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-neutral-900 dark:border dark:border-neutral-800 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-lg mx-auto max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-neutral-100">
                Recover stranded invoice
              </h3>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={state === "processing"}
            className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 p-1 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {state === "idle" && (
            <>
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
                <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  This will:
                </h4>
                <ol className="text-sm text-amber-700 dark:text-amber-300 list-decimal pl-5 space-y-1">
                  <li>
                    Void the dead invoice <span className="font-mono">{originalInvoiceId}</span>
                  </li>
                  <li>Use a held draft if one exists, else create a fresh invoice</li>
                  <li>Finalize and attempt one charge against the customer&apos;s saved card</li>
                  <li>On success, clear pause_collection so next anchor bills normally</li>
                </ol>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 italic">
                  Voiding cannot be undone. If the charge fails, the customer ends up with a
                  fresh open invoice that can be retried via the existing flow.
                </p>
              </div>

              {expectedAmountCents !== undefined && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
                  Expected charge: <strong>{formatCurrency(expectedAmountCents)}</strong>
                </div>
              )}

              <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
                <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                  Type <strong>RECOVER</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="RECOVER"
                  className="w-full px-3 py-2 rounded-md text-sm uppercase text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                  autoFocus
                />
              </div>
            </>
          )}

          {state === "processing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600 dark:text-amber-500" />
              <p className="text-gray-600 dark:text-neutral-400">
                Voiding, recreating, finalizing, charging…
              </p>
            </div>
          )}

          {state === "success" && response?.row && (
            <div className="bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-900/45 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <h4 className="font-semibold text-green-800 dark:text-green-200">
                  Recovery complete
                </h4>
              </div>
              <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                <dt className="text-green-700 dark:text-green-300">New invoice</dt>
                <dd className="font-mono text-green-900 dark:text-green-100">
                  {response.newInvoiceId}
                </dd>
                <dt className="text-green-700 dark:text-green-300">Charge status</dt>
                <dd className="text-green-900 dark:text-green-100">{response.row.status}</dd>
                {response.row.amount !== undefined && (
                  <>
                    <dt className="text-green-700 dark:text-green-300">Amount</dt>
                    <dd className="text-green-900 dark:text-green-100">
                      {formatCurrency(response.row.amount)}
                    </dd>
                  </>
                )}
                {response.row.error && (
                  <>
                    <dt className="text-amber-700 dark:text-amber-300">Pay error</dt>
                    <dd className="text-amber-900 dark:text-amber-100">{response.row.error}</dd>
                  </>
                )}
                {response.row.resumeCollectionError && (
                  <>
                    <dt className="text-amber-700 dark:text-amber-300">Resume error</dt>
                    <dd className="text-amber-900 dark:text-amber-100">
                      {response.row.resumeCollectionError}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {state === "error" && (
            <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">
                    Recovery failed
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {response?.message || response?.error || "Unknown error"}
                  </p>
                  {response?.reason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                      reason: {response.reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 pt-0 border-t border-gray-200 dark:border-neutral-800 bg-gray-50/80 dark:bg-neutral-950/80">
          <Button
            onClick={handleClose}
            variant="secondary"
            className="flex-1"
            disabled={state === "processing"}
          >
            {state === "success" || state === "error" ? "Close" : "Cancel"}
          </Button>
          {state === "idle" && (
            <Button
              onClick={() => void handleSubmit()}
              variant="secondary"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={confirmation !== "RECOVER"}
            >
              Recover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecoverInvoiceModal;
