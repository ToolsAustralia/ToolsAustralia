"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Package, ShoppingBag, Ticket, Truck } from "lucide-react";
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

/**
 * What each state actually means for the customer, in their terms.
 *
 * "Being made" begs the question it does not answer — every garment is printed to
 * order, so the wait is real and worth naming rather than leaving someone to
 * wonder whether their order is stuck.
 */
const STATUS_DETAIL: Record<string, string> = {
  // Covers BOTH readings of `pending`. A shop order is written pending the moment the
  // address is submitted — BEFORE any payment is attempted — so it is equally the state
  // of a webhook still in flight and of a checkout abandoned at the card form. Copy that
  // asserts a payment is being confirmed is simply false for the second, which is the
  // more common of the two.
  pending:
    "If you've just paid, we're confirming it now — that usually takes a few seconds. If you didn't finish checkout, nothing has been charged.",
  processing: "Your item is being printed to order. We'll email you when it ships.",
  shipped: "On its way to you.",
  delivered: "Delivered. Enjoy it.",
  completed: "All done.",
  // "a refund was issued", not "was refunded" — the same hedge `totalLabelFor` uses.
  // finalizeShopOrder attempts the refund, swallows a failure, and marks the order
  // cancelled regardless, so the refund is the intent and not a guarantee.
  cancelled:
    "This order was cancelled and a refund was issued. It can take a few business days to appear — email us if it doesn't.",
};

/**
 * The journey every fulfilled order takes, in order.
 *
 * `pending` is deliberately NOT a step: it is a few seconds while Stripe's webhook
 * lands, not a stage of fulfilment, and drawing it as one implies the customer is
 * waiting on something they can act on. `cancelled` is not a step either — it is an
 * exit from the journey, so those orders show no progress strip at all.
 */
const JOURNEY = [
  { key: "processing", label: "Being made" },
  { key: "shipped", label: "On its way" },
  { key: "delivered", label: "Delivered" },
] as const;

/** -1 = not on the journey (pending or cancelled). */
/**
 * What the total at the foot of a card actually IS, in that order's state.
 *
 * Mirrors the checkout success page rather than hard-coding "Total paid": on a
 * pending order nothing has been captured yet, and on a cancelled one the card
 * has already said the money was refunded — calling it "paid" in the same card
 * contradicts it.
 *
 * "Refund issued", not "Refunded": the cancel path in finalizeShopOrder attempts
 * the refund and swallows a failure, so the refund is the intent, not a
 * guarantee.
 */
const totalLabelFor = (status: string) => {
  if (status === "pending") return "Order total";
  if (status === "cancelled") return "Refund issued";
  return "Total paid";
};

const journeyIndex = (status: string) => {
  if (status === "completed") return JOURNEY.length - 1;
  return JOURNEY.findIndex((s) => s.key === status);
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
      {/*
        The shop link lives HERE, not only in the empty state.

        A customer with orders had no route back to the shop from this page at all —
        the only "Browse the shop" button was the one that appears when the list is
        empty, so buying once removed the way to buy again. The bottom nav carries
        Dashboard / Rewards / Draws / Membership / Support and no Shop either.
      */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Your orders</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            Everything you&apos;ve bought from the shop.
          </p>
        </div>
        <Link
          href="/shop"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          <ShoppingBag className="h-4 w-4" />
          Shop
        </Link>
      </div>

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
        {(orders ?? []).map((order) => {
          const step = journeyIndex(order.status);
          const isCancelled = order.status === "cancelled";
          const hasEntries = (order.entriesGranted ?? 0) > 0;
          return (
            <article
              key={order.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            >
              {/* Header: what it is and where it is. */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-4 dark:border-neutral-800 sm:p-5">
                <div className="min-w-0">
                  <h2 className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                    {order.orderNumber}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
                    {new Date(order.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    {" · "}
                    {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                    order.status
                  )}`}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>

              {/*
                The progress strip. This is the question a customer opens this page
                to answer, so it sits above the line items rather than under them.

                Hidden for cancelled orders and while payment is still confirming:
                a journey with no progress on it reads as a stalled order rather
                than one that never entered the journey.
              */}
              {step >= 0 && !isCancelled && (
                <div className="px-4 pt-4 sm:px-5">
                  <ol className="flex items-center gap-1.5">
                    {JOURNEY.map((stage, i) => {
                      const done = i <= step;
                      return (
                        <li key={stage.key} className="flex flex-1 flex-col gap-1.5">
                          <span
                            className={`h-1 rounded-full transition-colors ${
                              done
                                ? "bg-red-600 dark:bg-red-500"
                                : "bg-gray-200 dark:bg-neutral-700"
                            }`}
                          />
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              done
                                ? "text-gray-900 dark:text-neutral-100"
                                : "text-gray-500 dark:text-neutral-400"
                            }`}
                          >
                            {stage.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              <p className="px-4 pt-3 text-xs text-gray-600 dark:text-neutral-400 sm:px-5">
                {STATUS_DETAIL[order.status] ?? ""}
              </p>

              <ul className="mt-4 space-y-2 px-4 sm:px-5">
                {order.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-md bg-gray-100 px-1 text-[11px] font-bold text-gray-700 dark:bg-neutral-800 dark:text-neutral-200">
                        {item.quantity}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-gray-900 dark:text-neutral-100">{item.name}</span>
                        {/* The variant the customer chose ("Black · L"), not the internal sku. */}
                        {item.variant && (
                          <span className="block text-xs text-gray-500 dark:text-neutral-400">
                            {item.variant}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-700 dark:text-neutral-300">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-4 dark:border-neutral-800 sm:p-5">
                {(hasEntries || order.trackingNumber) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Rendered only above zero. Merchandise entries ship switched off
                      pending a permit, and "0 free entries" would state a promise we
                      are not making. Rule 11: a free inclusion, never priced. */}
                  {hasEntries && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      <Ticket className="h-3.5 w-3.5" />
                      Includes {order.entriesGranted} free{" "}
                      {order.entriesGranted === 1 ? "entry" : "entries"}
                    </span>
                  )}
                  {order.trackingNumber && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700 dark:bg-neutral-800 dark:text-neutral-200">
                      <Truck className="h-3.5 w-3.5" />
                      <span className="font-mono">{order.trackingNumber}</span>
                    </span>
                  )}
                </div>
                )}
                {/* ml-auto, not a spacer: with the badge strip gone the total still
                    has to hold the right edge. */}
                <p className="ml-auto text-right">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                    {totalLabelFor(order.status)}
                  </span>
                  <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">
                    ${order.totalAmount.toFixed(2)}
                  </span>
                  {/* Named only when it is non-zero, so the line reconciles with the
                      items above it instead of reading as an unexplained gap. */}
                  {(order.shippingCost ?? 0) > 0 && (
                    <span className="block text-[11px] text-gray-500 dark:text-neutral-500">
                      incl. ${(order.shippingCost ?? 0).toFixed(2)} postage
                    </span>
                  )}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
