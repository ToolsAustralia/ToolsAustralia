import { Metadata } from "next";
import CheckoutSuccessClient from "./components/CheckoutSuccessClient";

export const metadata: Metadata = {
  title: "Order Confirmed | Tools Australia",
  description: "Thank you for your order! Your purchase has been confirmed and is being processed.",
  keywords: "order confirmation, checkout success, tools australia, purchase confirmed",
};

interface CheckoutSuccessPageProps {
  searchParams: Promise<{
    orderId?: string;
  }>;
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  const orderId = resolvedSearchParams.orderId || "ORD-2024-001";

  return (
    <div className="min-h-screen-svh bg-gray-50">
      <CheckoutSuccessClient orderId={orderId} />
    </div>
  );
}
