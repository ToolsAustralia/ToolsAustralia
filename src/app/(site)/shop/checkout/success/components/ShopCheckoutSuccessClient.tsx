"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Mail } from "lucide-react";
import { useOrderByPaymentIntentQuery } from "@/hooks/queries/useOrdersQueries";
import { useCart, clearLocalCart } from "@/contexts/CartContext";
import { usePixelTracking } from "@/hooks/usePixelTracking";

interface Props {
  paymentIntentId: string;
}

const POLL_TIMEOUT_MS = 30_000;

export default function ShopCheckoutSuccessClient({ paymentIntentId }: Props) {
  const { data, isLoading } = useOrderByPaymentIntentQuery(paymentIntentId);
  const { clearCart } = useCart();
  const { trackPurchase } = usePixelTracking();

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // On ready: clear carts (server + localStorage) and fire Pixel Purchase.
  // CAPI Purchase is fired server-side from finalizeShopOrder with the same event_id (paymentIntentId) for dedup.
  const [hasFired, setHasFired] = useState(false);
  useEffect(() => {
    if (!hasFired && data?.status === "ready" && data.order) {
      clearLocalCart();
      void clearCart();
      try {
        trackPurchase({
          value: data.order.totalAmount,
          currency: "AUD",
          orderId: data.order.orderNumber,
          eventId: data.order.paymentIntentId,
          contentIds: data.order.products.map((p) => p.product),
        });
      } catch (err) {
        console.error("[shop] Pixel Purchase track failed", err);
      }
      setHasFired(true);
    }
  }, [hasFired, data, clearCart, trackPurchase]);

  if (data?.status === "ready" && data.order) {
    const orderNumber = data.order.orderNumber;
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center pt-[86px] sm:pt-[106px]">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-neutral-100">
          Order confirmed!
        </h1>
        <p className="text-gray-600 dark:text-neutral-400 mb-6">
          Thanks for your purchase. We&apos;ve emailed your tax invoice.
        </p>
        <div className="inline-block bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
          Order: {orderNumber}
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/my-account/orders/${orderNumber}`}
            className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            View order
          </Link>
          <Link
            href="/shop"
            className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-neutral-700"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center pt-[86px] sm:pt-[106px]">
        <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-neutral-100">
          Payment confirmed
        </h1>
        <p className="text-gray-600 dark:text-neutral-400 mb-6">
          Your order is processing — check your email shortly. Contact support if you don&apos;t see
          it within 5 minutes.
        </p>
        <Link
          href="/shop"
          className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-neutral-700"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  // Loading / pending
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 pt-[86px] sm:pt-[106px]">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600 dark:text-neutral-400 font-medium">
        {isLoading ? "Confirming your payment…" : "Processing your order…"}
      </p>
    </div>
  );
}
