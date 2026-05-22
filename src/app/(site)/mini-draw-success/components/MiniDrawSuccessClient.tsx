"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { CheckCircle } from "lucide-react";
import { usePaymentStatus } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";

interface MiniDrawSuccessClientProps {
  searchParams: {
    payment_intent_client_secret?: string;
    payment_intent?: string;
  };
}

export default function MiniDrawSuccessClient({ searchParams }: MiniDrawSuccessClientProps) {
  const paymentIntentId = searchParams.payment_intent;
  const { data: status } = usePaymentStatus(paymentIntentId, { enabled: !!paymentIntentId });
  const firedRef = useRef(false);

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
          contentName: status.data.packageName,
          numItems: 1,
          packageType: status.data.packageType ?? "mini-draw",
        },
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  }, [paymentIntentId, status]);

  return (
    <div className="bg-gray-50 dark:bg-neutral-950 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-950/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 font-['Poppins']">
            Mini Draw Entry Successful!
          </h1>
          <p className="text-gray-600 dark:text-neutral-400 text-lg">
            Thank you for your purchase. Your entry has been added to the mini draw.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <PaymentSuccessHandler paymentType="mini-draw" successMessage="Your mini-draw entry was added successfully!">
            <div className="mt-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm font-medium">
                  Your entry has been processed successfully. Good luck in the draw!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/my-account" className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors">View My Account</Link>
                <Link href="/" className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 dark:bg-neutral-800 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-neutral-700 transition-colors">Continue Shopping</Link>
              </div>
            </div>
          </PaymentSuccessHandler>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">What&apos;s Next?</h2>
          <ul className="space-y-3 text-gray-600 dark:text-neutral-400">
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>Your entry has been added to the mini draw</span></li>
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>You will receive a confirmation email with your entry details</span></li>
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>You can view your draw entries in the My Account section</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
