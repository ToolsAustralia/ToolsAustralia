import { Metadata } from "next";
import { Suspense } from "react";
import PurchaseSuccessClient from "./components/PurchaseSuccessClient";

export const metadata: Metadata = {
  title: "Purchase Successful | Tools Australia",
  description: "Thank you for your purchase! Your order has been confirmed and is being processed.",
  keywords: "purchase success, order confirmed, tools australia, purchase confirmed",
};

// Mark page as dynamic to prevent static generation issues with searchParams
export const dynamic = "force-dynamic";

interface PurchaseSuccessPageProps {
  searchParams: Promise<{
    payment_intent_client_secret?: string;
    payment_intent?: string;
  }>;
}

export default async function PurchaseSuccessPage({ searchParams }: PurchaseSuccessPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 font-medium">Loading payment details...</p>
        </div>
      }
    >
      <div className="min-h-screen-svh bg-gray-50">
        <PurchaseSuccessClient searchParams={resolvedSearchParams} />
      </div>
    </Suspense>
  );
}
