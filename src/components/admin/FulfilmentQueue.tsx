"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Truck, Undo2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDateInAEST } from "@/utils/common/timezone";

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
 *
 * Marking is per order, and everything marked can be put back. Both exist for the
 * same reason: the stamp removes a paid order from the queue, and until it could be
 * narrowed and undone, one wrong click meant a customer who paid and received
 * nothing, with nothing on any screen to show it had happened.
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

interface QueueOrder {
  orderId: string;
  orderNumber: string;
}

interface SubmittedOrder extends QueueOrder {
  submittedAt: string;
  customerName: string;
}

// Arrays are read with ?? [] at the use site. A missing key in the response used to
// throw "Cannot read properties of undefined" from .length and white-screen the whole
// admin Products tab, since this renders inside it — a warning banner is not worth
// taking the catalogue down for.
interface QueueState {
  orderCount: number;
  lineCount: number;
  orders: QueueOrder[];
  missingProductId: MissingProductId[];
  missingArtwork: MissingProductId[];
  rows: FulfilmentRow[];
  recentlySubmitted: SubmittedOrder[];
}

/** Orders shown before the list is truncated. The CSV always carries every one. */
const VISIBLE_ORDERS = 25;

export default function FulfilmentQueue() {
  const { has } = usePermissions();
  const canEdit = has("shop.edit");

  const [queue, setQueue] = useState<QueueState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);
  const [undoingOrderId, setUndoingOrderId] = useState<string | null>(null);
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
      // Everything selected by default: sending the whole queue is the normal run,
      // and an empty selection would turn the common case into 30 clicks.
      setSelected(new Set<string>((body.data?.orders ?? []).map((o: QueueOrder) => o.orderId)));
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

  const orders = useMemo(() => queue?.orders ?? [], [queue]);
  const recentlySubmitted = queue?.recentlySubmitted ?? [];

  // Lines carry their order number, not its id, so the grouping is by number — which
  // is also what the admin reads off the printer's screen.
  const linesByOrderNumber = useMemo(() => {
    const map = new Map<string, FulfilmentRow[]>();
    for (const row of queue?.rows ?? []) {
      const lines = map.get(row.orderNumber);
      if (lines) lines.push(row);
      else map.set(row.orderNumber, [row]);
    }
    return map;
  }, [queue]);

  const selectedCount = orders.filter((o) => selected.has(o.orderId)).length;

  // The download must carry the SAME selection as the mark button sitting beside
  // it. Ticking three of ten and getting a ten-row CSV means printing seven
  // garments nobody asked for. All-selected sends no ids, so the URL stays short
  // and the server falls back to the whole queue.
  const csvHref =
    selectedCount > 0 && selectedCount < orders.length
      ? `/api/admin/shop/fulfilment?format=csv&${orders
          .filter((o) => selected.has(o.orderId))
          .map((o) => `orderId=${encodeURIComponent(o.orderId)}`)
          .join("&")}`
      : "/api/admin/shop/fulfilment?format=csv";
  const allSelected = orders.length > 0 && selectedCount === orders.length;

  const toggleOrder = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.orderId)));
  };

  const handleMarkSubmitted = async () => {
    const orderIds = orders.filter((o) => selected.has(o.orderId)).map((o) => o.orderId);
    if (orderIds.length === 0) return;
    // A reprint costs a real garment and real freight, so this one asks.
    if (
      !window.confirm(
        `Mark ${orderIds.length} order${orderIds.length === 1 ? "" : "s"} as sent to the printer?\n\n` +
          `Do this only AFTER the CSV has uploaded successfully. They drop out of this queue — if the upload did not go through, put them back with Undo under "Recently sent".`
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
        body: JSON.stringify({ orderIds }),
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

  const handleUndo = async (order: SubmittedOrder) => {
    // The mirror of the mark: putting back an order the printer really does have is
    // how the same garment gets printed twice, so this one asks too.
    if (
      !window.confirm(
        `Put ${order.orderNumber} back in the print queue?\n\n` +
          `Do this only if that order was NOT uploaded to the printer. If it was, it will be printed and posted a second time.`
      )
    ) {
      return;
    }

    setUndoingOrderId(order.orderId);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/shop/fulfilment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [order.orderId] }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || "Failed to return the order to the print queue");
      }
      // A zero count means the order moved on while this screen sat open — it has
      // shipped, or someone else already put it back. Saying "back in the queue"
      // anyway would send the admin looking for a row that is not there.
      const unmarked = body.data?.unmarked ?? 0;
      setFeedback(
        unmarked > 0
          ? {
              type: "success",
              message: `${order.orderNumber} is back in the queue and will be in the next CSV.`,
            }
          : {
              type: "error",
              message: `${order.orderNumber} was not returned to the queue — it has since moved on. Check it in Orders.`,
            }
      );
      await load();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to return the order to the print queue",
      });
    } finally {
      setUndoingOrderId(null);
    }
  };

  const pending = queue?.orderCount ?? 0;
  const visibleOrders = orders.slice(0, VISIBLE_ORDERS);

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
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase text-gray-500 dark:text-neutral-400">
                  <tr>
                    <th scope="col" className="w-8 pb-2 pr-3 font-semibold">
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label={allSelected ? "Deselect every order" : "Select every order"}
                          className="h-4 w-4 cursor-pointer accent-red-600"
                        />
                      )}
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">
                      Order / item
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">
                      Qty
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      GTIN
                    </th>
                  </tr>
                </thead>
                {visibleOrders.map((order) => (
                  <tbody
                    key={order.orderId}
                    className="border-t border-gray-100 dark:border-neutral-800"
                  >
                    <tr className="text-gray-800 dark:text-neutral-100">
                      <td className="py-2 pr-3 align-top">
                        {canEdit && (
                          <input
                            type="checkbox"
                            checked={selected.has(order.orderId)}
                            onChange={() => toggleOrder(order.orderId)}
                            aria-label={`Include ${order.orderNumber} when marking as sent`}
                            className="h-4 w-4 cursor-pointer accent-red-600"
                          />
                        )}
                      </td>
                      <td colSpan={3} className="py-2 font-mono text-xs font-semibold">
                        {order.orderNumber}
                      </td>
                    </tr>
                    {(linesByOrderNumber.get(order.orderNumber) ?? []).map((r, i) => (
                      <tr
                        key={`${order.orderId}-${i}`}
                        className="text-gray-800 dark:text-neutral-100"
                      >
                        <td className="py-1 pr-3" />
                        <td className="py-1 pr-3 pl-1">
                          {r.productName}
                          {(r.size || r.colour) && (
                            <span className="text-gray-500 dark:text-neutral-400">
                              {" "}
                              · {[r.colour, r.size].filter(Boolean).join(" ")}
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-3">{r.quantity}</td>
                        <td className="py-1 font-mono text-xs">
                          {r.productId || (
                            <span className="text-amber-700 dark:text-amber-400">missing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
              {orders.length > VISIBLE_ORDERS && (
                <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
                  Showing the first {VISIBLE_ORDERS} of {orders.length} orders. The CSV contains all
                  of them, and Select all covers all of them.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={csvHref}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </a>
              {canEdit && (
                <button
                  onClick={() => void handleMarkSubmitted()}
                  disabled={isMarking || selectedCount === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark {selectedCount} as sent
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-neutral-400">
              Only mark them once the upload has gone through. Marking is what stops the same
              garment being printed twice, so it is deliberately a separate step. Tick only the
              orders that made it into the upload — the rest stay in the queue.
            </p>
          </>
        )}

        {/* Shown whether or not anything is pending: the moment an order is marked it
            leaves the queue above, so this list is the only place a wrong click can be
            seen and put right. */}
        {canEdit && recentlySubmitted.length > 0 && (
          <div className="mt-6 border-t border-gray-200 pt-5 dark:border-neutral-700">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Recently sent</h4>
            <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400">
              Marked as sent and no longer in the queue. If one was marked by mistake, undo it and
              it returns to the next CSV.
            </p>
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-neutral-800">
              {recentlySubmitted.map((order) => (
                <li
                  key={order.orderId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="text-gray-800 dark:text-neutral-100">
                    <span className="font-mono text-xs">{order.orderNumber}</span>
                    {order.customerName && (
                      <span className="text-gray-500 dark:text-neutral-400"> · {order.customerName}</span>
                    )}
                    <span className="text-gray-500 dark:text-neutral-400">
                      {" "}
                      · {formatDateInAEST(new Date(order.submittedAt), "d MMM h:mma")}
                    </span>
                  </span>
                  <button
                    onClick={() => void handleUndo(order)}
                    disabled={undoingOrderId !== null}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {undoingOrderId === order.orderId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Undo2 className="h-3.5 w-3.5" />
                    )}
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
