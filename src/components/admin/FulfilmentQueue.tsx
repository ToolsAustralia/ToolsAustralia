"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Truck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Paid orders waiting to be sent to the print provider.
 *
 * Orders are handed to the provider by bulk CSV upload rather than through their
 * API. This panel is that workflow:
 * download the file, upload it on their site, then mark the orders as submitted.
 *
 * Download and mark are SEPARATE buttons on purpose. Marking on download would hide
 * a paid order from the next export whenever a download failed or was cancelled — a
 * garment that silently never gets printed. This way the admin confirms the upload
 * actually happened before anything is stamped.
 */

interface MissingProductId {
  orderNumber: string;
  sku: string;
  productName: string;
}

interface FulfilmentRow {
  orderNumber: string;
  productName: string;
  size: string;
  colour: string;
  quantity: number;
  productId: string;
}

// Arrays are read with ?? [] at the use site. A missing key in the response used to
// throw "Cannot read properties of undefined" from .length and white-screen the whole
// admin Products tab, since this renders inside it — a warning banner is not worth
// taking the catalogue down for.
interface QueueState {
  orderCount: number;
  lineCount: number;
  orderIds: string[];
  missingProductId: MissingProductId[];
  missingArtwork: MissingProductId[];
  rows: FulfilmentRow[];
}

export default function FulfilmentQueue() {
  const { has } = usePermissions();
  const canEdit = has("shop.edit");

  const [queue, setQueue] = useState<QueueState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/shop/fulfilment");
      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || "Failed to load the fulfilment queue");
      }
      setQueue(body.data);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load the fulfilment queue",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkSubmitted = async () => {
    if (!queue?.orderIds.length) return;
    // A reprint costs a real garment and real freight, so this one asks.
    if (
      !window.confirm(
        `Mark ${queue.orderCount} order${queue.orderCount === 1 ? "" : "s"} as sent to the printer?\n\n` +
          `Do this only AFTER the CSV has uploaded successfully. Once marked, these orders drop out of this queue and cannot be exported again.`
      )
    ) {
      return;
    }

    setIsMarking(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/shop/fulfilment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: queue.orderIds }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || "Failed to mark orders as submitted");
      }
      const marked = body.data?.marked ?? 0;
      setFeedback({
        type: "success",
        message: `${marked} order${marked === 1 ? "" : "s"} marked as sent to the printer.`,
      });
      await load();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to mark orders as submitted",
      });
    } finally {
      setIsMarking(false);
    }
  };

  const pending = queue?.orderCount ?? 0;

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
      <div className="border-b border-gray-200 p-4 dark:border-neutral-700 sm:p-6">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
              <Truck className="h-5 w-5 text-red-600 dark:text-red-400" />
              Send to printer
            </h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400 sm:text-sm">
              Paid orders not yet sent. Download the CSV, upload it on the print provider&apos;s
              site, then mark them as sent.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={isLoading}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mx-4 mt-4 rounded-lg border p-3 text-sm sm:mx-6 ${
            feedback.type === "success"
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the queue…
          </div>
        ) : pending === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Nothing waiting — every paid order has been sent to the printer.
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-800 dark:text-neutral-100">
              <span className="font-bold">{pending}</span> order{pending === 1 ? "" : "s"} ·{" "}
              <span className="font-bold">{queue?.lineCount ?? 0}</span> garment
              {(queue?.lineCount ?? 0) === 1 ? "" : "s"} to print
            </p>

            {/* A missing GTIN is the one thing that will get the file rejected, so it is
                called out before the download rather than discovered on their site. */}
            {queue &&
              (
                [
                  {
                    key: "gtin",
                    items: queue.missingProductId ?? [],
                    title: (n: number) => `${n} line${n === 1 ? " has" : "s have"} no GTIN`,
                    detail:
                      "These export with an empty product_id. Add the GTIN to the variant in Products, or fill the column in before uploading — the printer cannot match a blank.",
                  },
                  {
                    key: "artwork",
                    items: queue.missingArtwork ?? [],
                    title: (n: number) =>
                      `${n} line${n === 1 ? " has" : "s have"} no print artwork`,
                    detail:
                      "These export with empty image columns. Add printing artwork (not a mockup) to the product — the printer has nothing to print without it.",
                  },
                ] as const
              )
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <div
                    key={group.key}
                    className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4" />
                      {group.title(group.items.length)}
                    </p>
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">{group.detail}</p>
                    <ul className="mt-2 space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
                      {group.items.slice(0, 8).map((m, i) => (
                        <li key={`${m.orderNumber}-${m.sku}-${i}`}>
                          {m.orderNumber} · {m.productName} · {m.sku || "no sku"}
                        </li>
                      ))}
                      {group.items.length > 8 && <li>…and {group.items.length - 8} more</li>}
                    </ul>
                  </div>
                ))}

            <div className="mb-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase text-gray-500 dark:text-neutral-400">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Order</th>
                    <th className="pb-2 pr-3 font-semibold">Item</th>
                    <th className="pb-2 pr-3 font-semibold">Qty</th>
                    <th className="pb-2 font-semibold">GTIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {(queue?.rows ?? []).slice(0, 25).map((r, i) => (
                    <tr key={`${r.orderNumber}-${i}`} className="text-gray-800 dark:text-neutral-100">
                      <td className="py-2 pr-3 font-mono text-xs">{r.orderNumber}</td>
                      <td className="py-2 pr-3">
                        {r.productName}
                        {(r.size || r.colour) && (
                          <span className="text-gray-500 dark:text-neutral-400">
                            {" "}
                            · {[r.colour, r.size].filter(Boolean).join(" ")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{r.quantity}</td>
                      <td className="py-2 font-mono text-xs">
                        {r.productId || (
                          <span className="text-amber-700 dark:text-amber-400">missing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(queue?.rows.length ?? 0) > 25 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
                  Showing the first 25 of {queue?.rows.length}. The CSV contains all of them.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/admin/shop/fulfilment?format=csv"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </a>
              {canEdit && (
                <button
                  onClick={() => void handleMarkSubmitted()}
                  disabled={isMarking}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark {pending} as sent
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-neutral-400">
              Only mark them once the upload has gone through. Marking is what stops the same
              garment being printed twice, so it is deliberately a separate step.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
