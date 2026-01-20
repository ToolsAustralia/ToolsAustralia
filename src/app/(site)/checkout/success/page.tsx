import { Metadata } from "next";
import { Suspense } from "react";
import CheckoutSuccessClient from "./components/CheckoutSuccessClient";

export const metadata: Metadata = {
  title: "Order Confirmed | Tools Australia",
  description: "Thank you for your order! Your purchase has been confirmed and is being processed.",
  keywords: "order confirmation, checkout success, tools australia, purchase confirmed",
};

// Mark page as dynamic to prevent static generation issues with searchParams
export const dynamic = "force-dynamic";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{
    orderId?: string;
  }>;
}

function CheckoutSuccessContent({ searchParams }: CheckoutSuccessPageProps) {
  // This will be wrapped in Suspense by the parent component
  return null; // Placeholder - will be replaced
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  const orderId = resolvedSearchParams.orderId || "ORD-2024-001";

  return (
    <Suspense
      fallback={
        <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 font-medium">Loading order details...</p>
        </div>
      }
    >
      <div className="min-h-screen-svh bg-gray-50">
        <CheckoutSuccessClient orderId={orderId} />
      </div>
    </Suspense>
  );
}
