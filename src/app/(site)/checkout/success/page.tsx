import { Metadata } from "next";
import { Suspense } from "react";
import CheckoutSuccessClient from "./components/CheckoutSuccessClient";

export const metadata: Metadata = {
  // Deliberately neutral. This page renders three states — confirmed, still
  // confirming, and cancelled-with-refund — and static metadata cannot tell them
  // apart, so "Order Confirmed" sat in the tab above a cancelled, refunded order.
  title: "Your order | Tools Australia",
  description: "Your Tools Australia order details.",
  keywords: "order confirmation, checkout success, tools australia, purchase confirmed",
};

// Mark page as dynamic to prevent static generation issues with searchParams
export const dynamic = "force-dynamic";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{
    orderId?: string;
    payment_intent_client_secret?: string;
    payment_intent?: string;
  }>;
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  // No fabricated fallback. "ORD-2024-001" was a placeholder that reached
  // /api/orders/[id] and 500d on a CastError, making a missing query param look
  // like an outage. An absent id now renders the page's own not-found state.
  const orderId = resolvedSearchParams.orderId ?? "";

  return (
    <Suspense
      fallback={
        <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-neutral-950">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-neutral-400 font-medium">Loading order details...</p>
        </div>
      }
    >
      <div className="min-h-screen-svh bg-gray-50 dark:bg-neutral-950">
        <CheckoutSuccessClient orderId={orderId} />
      </div>
    </Suspense>
  );
}
