"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle,
  Package,
  Truck,
  Mail,
  Phone,
  Download,
  ArrowRight,
  Calendar,
  MapPin,
  CreditCard,
} from "lucide-react";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { getContactEmail } from "@/lib/email/sender-identities";
import { useOrder } from "@/hooks/queries/useOrderQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { markPurchasePixelFired, shouldSuppressPurchasePixel } from "@/utils/tracking/purchase-pixel-fired-storage";

interface CheckoutSuccessClientProps {
  orderId: string;
}

const PLACEHOLDER_IMG = "/images/SampleProducts/dewalt1.jpg";

export default function CheckoutSuccessClient({ orderId }: CheckoutSuccessClientProps) {
  const { data: order, isLoading, isError, error } = useOrder(orderId);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!order) return;
    if (order.paymentStatus !== "paid") return;
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
          numItems: order.items?.length,
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

  const paymentMethodLabel = order.paymentMethod
    ? `${order.paymentMethod.brand ?? order.paymentMethod.type} ending in ${order.paymentMethod.last4 ?? "••••"}`
    : "Card";

  const addr = order.shippingAddress;
  const shipName = `${addr.firstName} ${addr.lastName}`.trim();

  return (
    <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Payment Status Handler - Handles 3DS redirects */}
        <PaymentSuccessHandler paymentType="one-time" successMessage="Your payment was successful!">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-poppins">Order Confirmed!</h1>
            <p className="text-gray-600 dark:text-neutral-400 text-lg">Thank you for your purchase. We&apos;re getting your order ready.</p>
            <div className="mt-4 inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
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
              {order.items.map((item) => {
                const img = item.product?.images?.[0] ?? PLACEHOLDER_IMG;
                const name = item.product?.name ?? "Product";
                const brand = item.product?.brand ?? "";
                return (
                  <div key={`${item.productId}-${item.quantity}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex-shrink-0">
                      <Image src={img} alt={name} width={64} height={64} className="w-full h-full object-cover" sizes="64px" />
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
                <span>Total Paid:</span>
                <span className="text-green-600">${order.totalAmount.toFixed(2)}</span>
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
                {order.estimatedDelivery ? (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-neutral-400">
                      Estimated delivery: <strong>{new Date(order.estimatedDelivery).toLocaleDateString()}</strong>
                    </span>
                  </div>
                ) : null}
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div className="text-sm text-gray-600 dark:text-neutral-400">
                    <div>
                      <strong>{shipName}</strong>
                    </div>
                    <div>{addr.address}</div>
                    <div>
                      {addr.city}, {addr.state} {addr.postalCode}
                    </div>
                    <div>{addr.country}</div>
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
                  <span className="text-sm text-gray-600 dark:text-neutral-400">Amount Paid:</span>
                  <span className="text-sm font-medium text-gray-900">${order.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-neutral-400">Status:</span>
                  <span className="text-sm font-medium text-green-600 capitalize">{order.paymentStatus}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 font-poppins">What&apos;s Next?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <Mail className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Email Confirmation</h3>
              <p className="text-sm text-gray-600 dark:text-neutral-400">You&apos;ll receive an order confirmation email shortly</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <Package className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Processing</h3>
              <p className="text-sm text-gray-600 dark:text-neutral-400">We&apos;re preparing your order for shipment</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <Truck className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Shipping</h3>
              <p className="text-sm text-gray-600 dark:text-neutral-400">You&apos;ll get tracking info when your order ships</p>
            </div>
          </div>
        </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/my-account"
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

          <button className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 dark:text-neutral-200 rounded-lg font-medium hover:bg-gray-50 transition-all duration-200">
            <Download className="w-4 h-4 mr-2" />
            Download Receipt
          </button>
          </div>

          {/* Support Information */}
          <div className="text-center mt-8 p-6 bg-gray-100 rounded-2xl">
          <h3 className="font-semibold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-gray-600 dark:text-neutral-400 mb-4">
            If you have any questions about your order, our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:+61412345678"
              className="inline-flex items-center gap-2 text-gray-600 dark:text-neutral-400 hover:text-gray-900 transition-colors"
            >
              <Phone className="w-4 h-4" />
              +61 4XX XXX XXX
            </a>
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
