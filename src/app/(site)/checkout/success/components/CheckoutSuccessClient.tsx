"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Package,
  Truck,
  Mail,
  ArrowRight,
  MapPin,
  Ticket,
} from "lucide-react";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { getContactEmail } from "@/lib/email/sender-identities";
import { useOrder, isOrderPaid } from "@/hooks/queries/useOrderQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { markPurchasePixelFired, shouldSuppressPurchasePixel } from "@/utils/tracking/purchase-pixel-fired-storage";

interface CheckoutSuccessClientProps {
  orderId: string;
}

/** The page ground, kept in one place so every state renders on the same surface. */
const PAGE_SHELL =
  "bg-gray-50 dark:bg-neutral-950 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh";

/** A raised panel. Both themes, one string — the page has five of these. */
const CARD =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

export default function CheckoutSuccessClient({ orderId }: CheckoutSuccessClientProps) {
  const { data: order, isLoading, isError, error } = useOrder(orderId);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!order) return;
    // No paymentStatus field exists — payment state is inferred from status,
    // which is the only thing the webhook writes.
    if (!isOrderPaid(order)) return;
    if (!order.totalAmount || order.totalAmount <= 0) return;
    // firedRef only survives one mount; Meta's event_id dedup only ~48h. Re-fires
    // inside that window are merged by Meta and recover a swallowed first fire —
    // which matters most here, since shop has no CAPI counterpart to anchor the
    // real conversion. Only a revisit BEYOND the window (which Meta would count
    // as a brand-new conversion) is suppressed.
    const purchaseEventId = order.orderNumber ?? orderId;
    if (shouldSuppressPurchasePixel(purchaseEventId)) {
      firedRef.current = true;
      return;
    }
    firedRef.current = true;
    markPurchasePixelFired(purchaseEventId);
    trackConversion(
      buildPurchaseEvent({
        value: order.totalAmount,
        currency: "AUD",
        eventId: order.orderNumber ?? orderId,
        customData: {
          orderId: order.orderNumber ?? orderId,
          contentType: "product",
          numItems: order.products?.length,
        },
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  }, [order, orderId]);

  const contactEmail = getContactEmail();

  if (isLoading) {
    return (
      <div className={PAGE_SHELL}>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-8 w-64 rounded-lg" />
            <Skeleton className="h-4 w-80 rounded" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
            <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className={PAGE_SHELL}>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
            <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
            Couldn&apos;t load order
          </h1>
          <p className="mb-6 text-gray-600 dark:text-neutral-400">
            {error instanceof Error ? error.message : "Please check your order ID or try again later."}
          </p>
          <Link
            href="/my-account/orders"
            className="inline-flex h-11 items-center rounded-full bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Go to your orders
          </Link>
        </div>
      </div>
    );
  }

  // shippingAddress is optional (a ticket-only order has none), so it must be
  // narrowed rather than assumed present.
  const addr = order.shippingAddress;
  const shipName = addr ? `${addr.firstName ?? ""} ${addr.lastName ?? ""}`.trim() : "";
  const hasAddress = Boolean(addr?.addressLine1 ?? addr?.address ?? addr?.city);

  const isPaid = isOrderPaid(order);
  // `cancelled` has exactly one writer: the stock-loss branch in
  // finalizeShopOrder. It attempts a full refund first -- but its stripe.refunds
  // .create is wrapped in a .catch that only logs, then falls through and sets
  // cancelled regardless. So a refund is the intent, NOT a guarantee, and this
  // page must not state it as settled fact: the one case where it is untrue is
  // exactly the case where a human still has to act.
  const isCancelled = order.status === "cancelled";

  // The headline is guarded on the order's ACTUAL state. It used to read "Order
  // Confirmed!" unconditionally, so a customer whose order had just been
  // auto-refunded for lost stock was congratulated on it — and one whose webhook
  // was still a few seconds out was told it was done before it was. The middle
  // state gets its own honest wording rather than being folded into either.
  //
  // Every tone carries BOTH themes: a `text-green-600` with no dark counterpart
  // is the exact bug that made this page's headline vanish into its own ground.
  const statusHeader = isPaid
    ? {
        Icon: CheckCircle,
        tone: "text-green-600 dark:text-green-400",
        ring: "bg-green-100 dark:bg-green-950/50",
        title: "Order confirmed",
        body: "Thanks for your order. We're getting it made.",
      }
    : isCancelled
      ? {
          Icon: AlertCircle,
          tone: "text-amber-600 dark:text-amber-400",
          ring: "bg-amber-100 dark:bg-amber-950/50",
          title: "This order was cancelled",
          body: "An item sold out after you paid, so we cancelled the order and issued a refund. Refunds usually take a few business days to appear on your statement — if yours hasn't, email us and we'll chase it.",
        }
      : {
          Icon: Clock,
          tone: "text-blue-600 dark:text-blue-400",
          ring: "bg-blue-100 dark:bg-blue-950/50",
          title: "We're confirming your payment",
          body: "This normally takes a few seconds. Refresh this page to check, or find the order any time under My Account.",
        };
  const StatusIcon = statusHeader.Icon;

  // One label for both money rows, so the page never says "paid" about an order
  // that has not been paid for or has already been refunded.
  // "Refund issued", not "Refunded": see the isCancelled comment above -- the
  // refund can fail and the order is still marked cancelled.
  const totalLabel = isPaid ? "Total paid" : isCancelled ? "Refund issued" : "Order total";

  const discounts = order.appliedDiscounts ?? [];
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className={PAGE_SHELL}>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Payment Status Handler - Handles 3DS redirects */}
        <PaymentSuccessHandler paymentType="one-time" successMessage="Your payment was successful!">
          {/* ── The one thing the customer came here to read ────────────────── */}
          <div className="text-center">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${statusHeader.ring}`}
            >
              <StatusIcon className={`h-9 w-9 ${statusHeader.tone}`} />
            </div>
            <h1 className="font-poppins text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              {statusHeader.title}
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-gray-600 dark:text-neutral-400">
              {statusHeader.body}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-gray-200 dark:bg-neutral-900 dark:ring-neutral-800">
              <span className="text-gray-500 dark:text-neutral-400">Order</span>
              <span className="font-mono font-semibold text-gray-900 dark:text-white">
                {order.orderNumber}
              </span>
            </div>

            {/*
              Entries are announced next to the order, not buried in the money
              rows: they are the free inclusion the customer earned, and they are
              rendered ONLY above zero. Merchandise entries currently ship dark
              at includedEntries: 0, so "0 free entries" would state a promise we
              are not making (rule 11 — a free inclusion, never priced).
            */}
            {isPaid && (order.entriesGranted ?? 0) > 0 && (
              <p className="mt-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <Ticket className="h-4 w-4" />
                  {order.entriesGranted} free {order.entriesGranted === 1 ? "entry" : "entries"} added
                  to this month&apos;s draw
                </span>
              </p>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* ── What you bought, and what it cost ─────────────────────────── */}
            <div className={`${CARD} p-5 sm:p-6 lg:col-span-3`}>
              <h2 className="font-poppins text-lg font-bold text-gray-900 dark:text-white">
                Your order
              </h2>

              <ul className="mt-4 space-y-3">
                {order.products.map((item) => {
                  // `product` is an ObjectId ref the read route populates; it is a
                  // bare id string when population is skipped, so narrow before use.
                  const populated = typeof item.product === "object" ? item.product : undefined;
                  // Falls back to an icon, not a stand-in photo. The old fallback was
                  // a DeWalt product shot, so an item whose image had not loaded was
                  // pictured as a brand we do not sell.
                  const img = populated?.images?.[0];
                  // Prefer the snapshot — the catalog may have been renamed since.
                  const name = item.name ?? populated?.name ?? "Product";
                  // Same join order as the order-history list, so one purchase
                  // never reads as two different variants on two pages.
                  const variant = [item.colour, item.size].filter(Boolean).join(" · ");
                  return (
                    <li
                      key={`${populated?._id ?? name}-${item.sku ?? ""}-${item.quantity}`}
                      className="flex items-center gap-3"
                    >
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-neutral-800">
                        {img ? (
                          <Image
                            src={img}
                            alt={name}
                            width={64}
                            height={64}
                            className="h-full w-full object-contain"
                            sizes="64px"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-gray-400 dark:text-neutral-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-neutral-100">
                          {name}
                        </h3>
                        {variant && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">{variant}</p>
                        )}
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
                          Qty {item.quantity}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-neutral-100">
                        {money(item.price * item.quantity)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/*
                The full composition, not just a total. An Australian tax invoice
                has to show the GST, and GST is already INSIDE totalAmount — it is
                stated beneath the total as a note, never added as a row, or the
                arithmetic on screen would not sum.
              */}
              <dl className="mt-5 space-y-2 border-t border-gray-100 pt-5 text-sm dark:border-neutral-800">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-neutral-400">Subtotal</dt>
                  <dd className="tabular-nums text-gray-900 dark:text-neutral-100">
                    {money(order.subtotal)}
                  </dd>
                </div>

                {discounts.map((d, i) => (
                  <div key={i} className="flex justify-between">
                    <dt className="text-green-700 dark:text-green-400">{d.description}</dt>
                    <dd className="tabular-nums text-green-700 dark:text-green-400">
                      −{money(d.amount)}
                    </dd>
                  </div>
                ))}

                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-neutral-400">Shipping</dt>
                  <dd className="tabular-nums text-gray-900 dark:text-neutral-100">
                    {order.shippingCost > 0 ? money(order.shippingCost) : "Free"}
                  </dd>
                </div>

                <div className="flex items-baseline justify-between border-t border-gray-100 pt-3 dark:border-neutral-800">
                  <dt className="font-bold text-gray-900 dark:text-white">{totalLabel}</dt>
                  <dd className={`text-xl font-bold tabular-nums ${statusHeader.tone}`}>
                    {money(order.totalAmount)}
                  </dd>
                </div>
                <p className="text-right text-xs text-gray-500 dark:text-neutral-400">
                  Includes {money(order.gstAmount)} GST
                  {isPaid ? " · paid by card" : ""}
                </p>
              </dl>
            </div>

            {/* ── Where it's going, and what happens next ────────────────────── */}
            <div className="space-y-6 lg:col-span-2">
              {hasAddress && (
                <div className={`${CARD} p-5 sm:p-6`}>
                  <h2 className="flex items-center gap-2 font-poppins text-lg font-bold text-gray-900 dark:text-white">
                    <MapPin className="h-4 w-4 text-gray-400 dark:text-neutral-500" />
                    Delivering to
                  </h2>
                  {/* No estimated-delivery date is stored. Print-to-order turnaround
                      is supplier-dependent and unconfirmed, so promising a date here
                      would be a guess shown to a paying customer. */}
                  <address
                    data-cs-mask
                    className="mt-3 space-y-0.5 text-sm not-italic text-gray-600 dark:text-neutral-400"
                  >
                    {shipName && (
                      <div className="font-semibold text-gray-900 dark:text-neutral-100">{shipName}</div>
                    )}
                    {/* addressLine1 is the current field; `address` is the legacy
                        single line kept only so pre-2026-08 orders still render. */}
                    <div>{addr?.addressLine1 ?? addr?.address}</div>
                    {addr?.addressLine2 ? <div>{addr.addressLine2}</div> : null}
                    <div>
                      {addr?.city}, {addr?.state} {addr?.postalCode}
                    </div>
                    <div>{addr?.country}</div>
                  </address>
                </div>
              )}

              {/* Only for an order that is actually going ahead. On a cancelled
                  order every one of these steps describes something that will
                  never happen. */}
              {isPaid && (
                <div className={`${CARD} p-5 sm:p-6`}>
                  <h2 className="font-poppins text-lg font-bold text-gray-900 dark:text-white">
                    What happens next
                  </h2>
                  <ol className="mt-4 space-y-4">
                    {[
                      {
                        Icon: Mail,
                        title: "Confirmation email",
                        body: "Your confirmation and tax invoice are on their way to your inbox.",
                      },
                      {
                        Icon: Package,
                        title: "We print it",
                        body: "Your gear is printed to order, so give us a little time before it ships.",
                      },
                      {
                        Icon: Truck,
                        title: "It ships",
                        // Nothing emails a tracking number — an admin adds it to
                        // the order and my-account/orders renders it. Say where it
                        // turns up rather than promising a message we never send.
                        body: "Tracking appears on your order in My Account once it's on the way.",
                      },
                    ].map((step) => (
                      <li key={step.title} className="flex gap-3">
                        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
                          <step.Icon className="h-4 w-4 text-gray-600 dark:text-neutral-300" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-gray-900 dark:text-neutral-100">
                            {step.title}
                          </span>
                          <span className="block text-xs text-gray-600 dark:text-neutral-400">
                            {step.body}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {/* Was /my-account, which has no orders on it — the button promised order
                details and delivered a dashboard. /my-account/orders is the page that
                actually answers it. */}
            <Link
              href="/my-account/orders"
              className="inline-flex h-12 items-center justify-center rounded-full bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              View your orders
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <Link
              href="/shop"
              className="inline-flex h-12 items-center justify-center rounded-full border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              Keep shopping
            </Link>

            {/* "Download Receipt" was removed: it had no onClick and never did anything.
                A button that silently does nothing is worse than no button — a customer
                clicks it, gets no file, and contacts support. The receipt is emailed on
                payment (sendShopOrderConfirmation); if a downloadable invoice is wanted
                later it needs a real endpoint behind it. */}
          </div>

          <p className="mt-8 text-center text-sm text-gray-600 dark:text-neutral-400">
            {/* The "+61 4XX XXX XXX" that used to sit here was a placeholder wired
                to tel:+61412345678 — a real, dialable number belonging to a
                stranger. There is no support phone line, so the email is the whole
                of it. */}
            Questions about this order?{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-red-600 underline-offset-2 hover:underline dark:text-red-400"
            >
              {contactEmail}
            </a>
          </p>
        </PaymentSuccessHandler>
      </div>
    </div>
  );
}
