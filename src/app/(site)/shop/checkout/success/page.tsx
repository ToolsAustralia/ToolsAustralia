import { Metadata } from "next";
import { Suspense } from "react";
import ShopCheckoutSuccessClient from "./components/ShopCheckoutSuccessClient";

export const metadata: Metadata = {
  title: "Order Confirmed | Tools Australia",
  description: "Thank you for your order! Your purchase has been confirmed and is being processed.",
};

// `searchParams` arrive as a Promise in Next.js 15. We force dynamic so static
// generation doesn't trip on the Stripe-supplied query string.
export const dynamic = "force-dynamic";

interface ShopCheckoutSuccessPageProps {
  searchParams: Promise<{
    payment_intent?: string;
    payment_intent_client_secret?: string;
    redirect_status?: string;
  }>;
}

export default async function ShopCheckoutSuccessPage({
  searchParams,
}: ShopCheckoutSuccessPageProps) {
  const sp = await searchParams;
  const paymentIntentId = sp.payment_intent ?? "";

  return (
    <Suspense
      fallback={
        <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-neutral-950">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-neutral-400 font-medium">Loading order details…</p>
        </div>
      }
    >
      <div className="min-h-screen-svh bg-gray-50 dark:bg-neutral-950">
        <ShopCheckoutSuccessClient paymentIntentId={paymentIntentId} />
      </div>
    </Suspense>
  );
}
