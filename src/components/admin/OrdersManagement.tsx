"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search, ShoppingBag } from "lucide-react";

/**
 * Shop order list for admin.
 *
 * The category filter is DERIVED from what orders actually contain — "Apparel"
 * today, and tools too if they are ever stocked and sold. A hard-coded list would
 * offer a filter that matches nothing, which is the bug the shop's facet rail had.
 *
 * Reads the same service the customer's own history does; the difference is that
 * this one is not scoped to a user.
 */

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  totalAmount: number;
  itemCount: number;
  categories: string[];
  customerName?: string;
  entriesGranted?: number;
  submittedAt?: string;
  trackingNumber?: string;
  items: { name: string; sku?: string; quantity: number; price: number }[];
}

interface OrdersResponse {
  orders: OrderRow[];
  total: number;
  page: number;
  totalPages: number;
  categories: string[];
}

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled", "completed"] as const;

const statusClass = (status: string) =>
  ({
    pending: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    shipped: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    delivered: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  })[status] ?? "bg-gray-100 text-gray-700";

export default function OrdersManagement() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounced so typing a surname does not fire a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await fetch(`/api/admin/shop/orders?${params}`);
      if (!res.ok) throw new Error("Failed to load orders");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }, [page, status, category, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any filter change invalidates the current page — staying on page 4 of a
  // narrower result set shows an empty list that looks like "no orders".
  useEffect(() => {
    setPage(1);
  }, [status, category, debouncedSearch]);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const selectClass =
    "h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
      <div className="border-b border-gray-200 p-4 dark:border-neutral-700 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
          <ShoppingBag className="h-5 w-5 text-red-600 dark:text-red-400" />
          Orders
        </h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400 sm:text-sm">
          Every shop order. Filter by type, status, order number or customer.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order number, name or email…"
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>

          {/* Only shown once there is more than one type to choose between — with a
              single category the control is decoration. It appears by itself the day
              a second category is sold. */}
          {categories.length > 1 && (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading orders…
          </div>
        ) : !data || data.orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Package className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100">No orders found</p>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              {status || category || debouncedSearch
                ? "Try clearing a filter."
                : "Orders will appear here once customers start buying."}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-500 dark:text-neutral-400">
              {data.total} order{data.total === 1 ? "" : "s"}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-gray-500 dark:text-neutral-400">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Order</th>
                    <th className="pb-2 pr-3 font-semibold">Customer</th>
                    <th className="pb-2 pr-3 font-semibold">Items</th>
                    <th className="pb-2 pr-3 font-semibold">Type</th>
                    <th className="pb-2 pr-3 font-semibold">Total</th>
                    <th className="pb-2 pr-3 font-semibold">Entries</th>
                    <th className="pb-2 pr-3 font-semibold">Printer</th>
                    <th className="pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {data.orders.map((o) => (
                    <tr key={o.id} className="align-top text-gray-800 dark:text-neutral-100">
                      <td className="py-2.5 pr-3">
                        <div className="font-mono text-xs">{o.orderNumber}</div>
                        <div className="text-xs text-gray-500 dark:text-neutral-400">
                          {new Date(o.createdAt).toLocaleDateString("en-AU")}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">{o.customerName || "—"}</td>
                      <td className="py-2.5 pr-3">
                        {o.items.slice(0, 2).map((i, idx) => (
                          <div key={idx} className="text-xs">
                            {i.quantity} × {i.name}
                          </div>
                        ))}
                        {o.items.length > 2 && (
                          <div className="text-xs text-gray-500">+{o.items.length - 2} more</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{o.categories.join(", ") || "—"}</td>
                      <td className="py-2.5 pr-3">${o.totalAmount.toFixed(2)}</td>
                      <td className="py-2.5 pr-3 text-xs">
                        {/* undefined and 0 mean different things: the grant has not run
                            versus it ran and the order was worth nothing. */}
                        {o.entriesGranted === undefined ? (
                          <span className="text-gray-400">not run</span>
                        ) : (
                          o.entriesGranted
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {o.submittedAt ? (
                          <span className="text-green-700 dark:text-green-400">sent</span>
                        ) : o.status === "processing" ? (
                          <span className="text-amber-700 dark:text-amber-400">waiting</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-200"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-600 dark:text-neutral-400">
                  {data.page} of {data.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-200"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
