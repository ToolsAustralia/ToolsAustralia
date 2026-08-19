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
  CreditCard,
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
      <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Couldn&apos;t load order</h1>
          <p className="text-gray-600 mb-6">{error instanceof Error ? error.message : "Please check your order ID or try again later."}</p>
          <Link href="/my-account" className="text-red-600 font-medium hover:underline">
            Go to My Account
          </Link>
        </div>
      </div>
    );
  }

  // No payment-method snapshot is stored on the Order — Stripe is the system of
  // record for it. A generic label beats inventing a field the schema lacks.
  const paymentMethodLabel = "Card";

  // shippingAddress is optional (a ticket-only order has none), so it must be
  // narrowed rather than assumed present.
  const addr = order.shippingAddress;
  const shipName = addr ? `${addr.firstName ?? ""} ${addr.lastName ?? ""}`.trim() : "";

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
  const statusHeader = isPaid
    ? {
        Icon: CheckCircle,
        tone: "text-green-600",
        ring: "bg-green-100",
        title: "Order confirmed",
        body: "Thanks for your order. We're getting it made.",
      }
    : isCancelled
      ? {
          Icon: AlertCircle,
          tone: "text-amber-600",
          ring: "bg-amber-100",
          title: "This order was cancelled",
          body: "An item sold out after you paid, so we cancelled the order and issued a refund. Refunds usually take a few business days to appear on your statement — if yours hasn't, email us and we'll chase it.",
        }
      : {
          Icon: Clock,
          tone: "text-blue-600",
          ring: "bg-blue-100",
          title: "We're confirming your payment",
          body: "This normally takes a few seconds. Refresh this page to check, or find the order any time under My Account.",
        };
  const StatusIcon = statusHeader.Icon;

  // One label for both money rows, so the page never says "paid" about an order
  // that has not been paid for or has already been refunded.
  // "Refund issued", not "Refunded": see the isCancelled comment above -- the
  // refund can fail and the order is still marked cancelled.
  const totalLabel = isPaid ? "Total paid" : isCancelled ? "Refund issued" : "Order total";

  return (
    <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Payment Status Handler - Handles 3DS redirects */}
        <PaymentSuccessHandler paymentType="one-time" successMessage="Your payment was successful!">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className={`w-20 h-20 ${statusHeader.ring} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <StatusIcon className={`w-12 h-12 ${statusHeader.tone}`} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-poppins">{statusHeader.title}</h1>
            <p className="text-gray-600 dark:text-neutral-400 text-lg max-w-xl mx-auto">{statusHeader.body}</p>
            <div className="mt-4 inline-block bg-gray-100 text-gray-800 px-4 py-2 rounded-full text-sm font-medium">
              Order: {order.orderNumber}
            </div>
          </div>

          {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Order Details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 font-poppins">Order Details</h2>
                <p className="text-gray-600 dark:text-neutral-400">Items in your order</p>
              </div>
            </div>

            <div className="space-y-4">
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
                const brand = populated?.brand ?? "";
                return (
                  <div key={`${populated?._id ?? name}-${item.sku ?? ""}-${item.quantity}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {img ? (
                        <Image src={img} alt={name} width={64} height={64} className="w-full h-full object-cover" sizes="64px" />
                      ) : (
                        <Package className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{name}</h3>
                      {brand ? <p className="text-xs text-gray-500">{brand}</p> : null}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm text-gray-600 dark:text-neutral-400">Qty: {item.quantity}</span>
                        <span className="font-semibold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>{totalLabel}:</span>
                <span className={statusHeader.tone}>${order.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping & Payment Info */}
          <div className="space-y-6">
            {/* Shipping Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Truck className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 font-poppins">Shipping Information</h3>
                  <p className="text-gray-600 dark:text-neutral-400 text-sm">Delivery details</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-neutral-400">
                    <strong>Shipping</strong>
                  </span>
                </div>
                {/* No estimated-delivery date is stored. Print-to-order turnaround
                    is supplier-dependent and unconfirmed, so promising a date here
                    would be a guess shown to a paying customer. */}
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div data-cs-mask className="text-sm text-gray-600 dark:text-neutral-400">
                    <div>
                      <strong>{shipName}</strong>
                    </div>
                    {/* addressLine1 is the current field; `address` is the legacy
                        single line kept only so pre-2026-08 orders still render. */}
                    <div>{addr?.addressLine1 ?? addr?.address}</div>
                    {addr?.addressLine2 ? <div>{addr.addressLine2}</div> : null}
                    <div>
                      {addr?.city}, {addr?.state} {addr?.postalCode}
                    </div>
                    <div>{addr?.country}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 font-poppins">Payment Information</h3>
                  <p className="text-gray-600 dark:text-neutral-400 text-sm">Payment details</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-neutral-400">Payment Method:</span>
                  <span className="text-sm font-medium text-gray-900">{paymentMethodLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-neutral-400">{totalLabel}:</span>
                  <span className="text-sm font-medium text-gray-900">${order.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-neutral-400">Status:</span>
                  <span className={`text-sm font-medium capitalize ${statusHeader.tone}`}>
                    {isPaid ? "paid" : isCancelled ? "refund issued" : "awaiting confirmation"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps — only for an order that is actually going ahead. On a
            cancelled order every one of these three cards describes something
            that will never happen. */}
        {isPaid && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 font-poppins">What&apos;s Next?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Mail className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Email Confirmation</h3>
                <p className="text-sm text-gray-600 dark:text-neutral-400">Your confirmation and tax invoice are on their way to your inbox</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <Package className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Printing</h3>
                <p className="text-sm text-gray-600 dark:text-neutral-400">Your gear is printed to order, so give us a little time before it ships</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Truck className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 mb-1">Shipping</h3>
                {/* Nothing emails a tracking number — an admin adds it to the
                    order and my-account/orders renders it. Say where it turns up
                    rather than promising a message we never send. */}
                <p className="text-sm text-gray-600 dark:text-neutral-400">Tracking appears on your order in My Account once it ships</p>
              </div>
            </div>
          </div>
        )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {/* Was /my-account, which has no orders on it — the button promised order
              details and delivered a dashboard. /my-account/orders is the page that
              actually answers it. */}
          <Link
            href="/my-account/orders"
            className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all duration-200"
          >
            View Order Details
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>

          <Link
            href="/shop"
            className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 text-gray-700 dark:text-neutral-200 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200"
          >
            Continue Shopping
          </Link>

          {/* "Download Receipt" was removed: it had no onClick and never did anything.
              A button that silently does nothing is worse than no button — a customer
              clicks it, gets no file, and contacts support. The receipt is emailed on
              payment (sendShopOrderConfirmation); if a downloadable invoice is wanted
              later it needs a real endpoint behind it. */}
          </div>

          {/* Support Information */}
          <div className="text-center mt-8 p-6 bg-gray-100 rounded-2xl">
          <h3 className="font-semibold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-gray-600 dark:text-neutral-400 mb-4">
            If you have any questions about your order, our support team is here to help.
          </p>
          {/* The "+61 4XX XXX XXX" that used to sit here was a placeholder wired
              to tel:+61412345678 — a real, dialable number belonging to a
              stranger. There is no support phone line, so the email is the whole
              of it. */}
          <div className="flex justify-center">
            <a
              href={`mailto:${contactEmail}`}
              className="inline-flex items-center gap-2 text-gray-600 dark:text-neutral-400 hover:text-gray-900 transition-colors"
            >
              <Mail className="w-4 h-4" />
              {contactEmail}
            </a>
          </div>
          </div>
        </PaymentSuccessHandler>
      </div>
    </div>
  );
}
