"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { CheckCircle } from "lucide-react";
import { SectionContainer } from "@/components/ui";
import { usePaymentStatus } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";

interface PurchaseSuccessClientProps {
  searchParams: {
    payment_intent_client_secret?: string;
    payment_intent?: string;
  };
}

export default function PurchaseSuccessClient({ searchParams }: PurchaseSuccessClientProps) {
  const paymentIntentId = searchParams.payment_intent;
  const { data: status } = usePaymentStatus(paymentIntentId, { enabled: !!paymentIntentId });
  const firedRef = useRef(false);

  const wasResubscribe = status?.data?.wasRecentResubscribe === true;
  const newAccum = status?.data?.lastMonthAccumulatedEntries ?? 0;
  const thisGrant = status?.data?.entriesGranted ?? 0;
  const previousAccum = Math.max(0, newAccum - thisGrant);

  // Fire Purchase pixel once on mount when the server confirms benefits were granted.
  // eventId === paymentIntentId so it dedups with server-side CAPI which uses the same id.
  // The /api/payment-status/[id] route only includes price/currency when processed === true
  // (see PaymentStatusResponse in src/hooks/queries/usePaymentQueries.ts:70-89), so we gate on that.
  useEffect(() => {
    if (firedRef.current) return;
    if (!paymentIntentId) return;
    if (status?.processed !== true) return;
    const value = status.data.price;
    const currency = status.data.currency;
    if (typeof value !== "number" || value <= 0) return;
    firedRef.current = true;
    trackConversion(
      buildPurchaseEvent({
        value,
        currency: (currency ?? "AUD").toUpperCase(),
        eventId: paymentIntentId,
        customData: {
          orderId: paymentIntentId,
          contentType: "product",
          contentIds: status.data.packageId ? [status.data.packageId] : undefined,
          numItems: 1,
          packageType: status.data.packageType,
        },
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  }, [paymentIntentId, status]);

  return (
    <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <SectionContainer variant="narrow" className="py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">
            Purchase Successful!
          </h1>
          <p className="text-gray-600 dark:text-neutral-400 text-lg">
            Thank you for your purchase. Your order has been confirmed and is being processed.
          </p>
        </div>
        {wasResubscribe && (
          <div className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Welcome back!
            </h2>
            <p className="text-sm text-gray-700 dark:text-neutral-300 mb-3">
              Your <strong>{previousAccum.toLocaleString()}</strong> accumulated entries carried over.
            </p>
            <ul className="text-sm text-gray-700 dark:text-neutral-300 space-y-1">
              <li>
                This month&apos;s draw: <strong>{thisGrant.toLocaleString()}</strong> entries.
              </li>
              <li>
                Next month&apos;s renewal: <strong>{newAccum.toLocaleString()} + base</strong> entries.
              </li>
            </ul>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <PaymentSuccessHandler paymentType="one-time" successMessage="Your purchase was successful!">
            <div className="mt-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm font-medium">
                  Your payment has been processed successfully. You will receive a confirmation email shortly.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/my-account" className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors">
                  View My Account
                </Link>
                <Link href="/" className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors">
                  Continue Shopping
                </Link>
              </div>
            </div>
          </PaymentSuccessHandler>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">What&apos;s Next?</h2>
          <ul className="space-y-3 text-gray-600 dark:text-neutral-400">
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>You will receive a confirmation email with your order details</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Your entries have been added to your account</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>You can view your account details in the My Account section</span>
            </li>
          </ul>
        </div>
      </SectionContainer>
    </div>
  );
}
