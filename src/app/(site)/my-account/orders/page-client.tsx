"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Ticket, Truck } from "lucide-react";
import { useOrders, type OrderListRow } from "@/hooks/queries/useOrderQueries";

/**
 * The customer's own order history.
 *
 * Before this, a customer could buy but never see the order again — the API and
 * query hooks existed, and nothing rendered them.
 *
 * Reads `/api/orders` through `useOrders`, which shares its query with the admin
 * list but pins `userId` to the session, so this can only ever return the signed-in
 * customer's own orders.
 *
 * Uses the shared query hook rather than its own fetch: caching, retry and
 * invalidation then behave the same here as everywhere else, and there is one place
 * that knows the endpoint's shape.
 */

/**
 * Customer-facing wording. `processing` is what a paid order sits at until it is
 * dispatched, and "Processing" reads like a stuck payment — a merch item is printed
 * to order, so this says so.
 */
const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  processing: "Being made",
  shipped: "On its way",
  delivered: "Delivered",
  completed: "Complete",
  cancelled: "Cancelled",
};

const statusClass = (status: string) =>
  ({
    pending: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    shipped: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    delivered: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  })[status] ?? "bg-gray-100 text-gray-700";

export default function OrdersPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  // The session id is what the route scopes on, so it is also what keys the query.
  const { data, isLoading, isError } = useOrders(session?.user?.id, { limit: 50 });
  const orders: OrderListRow[] | null = data?.orders ?? null;
  const error = isError ? "We couldn't load your orders just now." : null;

  useEffect(() => {
    // `unauthenticated` only — `loading` returns null data and would bounce a
    // signed-in customer to the login page before the session resolves.
    if (sessionStatus === "unauthenticated") router.replace("/login?callbackUrl=/my-account/orders");
  }, [sessionStatus, router]);

  if (sessionStatus === "loading" || (sessionStatus === "authenticated" && isLoading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Your orders</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
        Everything you&apos;ve bought from the shop.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {orders && orders.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-gray-200 py-14 text-center dark:border-neutral-800">
          <Package className="h-9 w-9 text-gray-300" />
          <p className="font-semibold text-gray-900 dark:text-white">No orders yet</p>
          <p className="max-w-sm text-sm text-gray-600 dark:text-neutral-400">
            When you buy something from the shop it&apos;ll show up here.
          </p>
          <Link
            href="/shop"
            className="mt-1 inline-flex h-10 items-center rounded-full bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Browse the shop
          </Link>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {(orders ?? []).map((order) => (
          <div
            key={order.id}
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-gray-500 dark:text-neutral-400">{order.orderNumber}</p>
                <p className="text-sm text-gray-600 dark:text-neutral-400">
                  {new Date(order.createdAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </div>

            <ul className="mt-4 space-y-1.5">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between gap-3 text-sm text-gray-800 dark:text-neutral-100">
                  <span>
                    {item.quantity} × {item.name}
                    {/* The variant the customer chose ("Black · L"), not the internal sku. */}
                    {item.variant && (
                      <span className="text-gray-500 dark:text-neutral-400"> · {item.variant}</span>
                    )}
                  </span>
                  <span className="shrink-0">${(item.price * item.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {/* Rendered only above zero. Merchandise entries ship switched off
                    pending a permit, and "0 free entries" would state a promise we
                    are not making. Rule 11: a free inclusion, never priced. */}
                {order.entriesGranted !== undefined && order.entriesGranted > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    <Ticket className="h-3.5 w-3.5" />
                    Includes {order.entriesGranted} free{" "}
                    {order.entriesGranted === 1 ? "entry" : "entries"}
                  </span>
                )}
                {order.trackingNumber && (
                  <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-neutral-400">
                    <Truck className="h-3.5 w-3.5" />
                    Tracking: <span className="font-mono">{order.trackingNumber}</span>
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                ${order.totalAmount.toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
