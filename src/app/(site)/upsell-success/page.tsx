import { Metadata } from "next";
import { Suspense } from "react";
import UpsellSuccessClient from "./components/UpsellSuccessClient";

export const metadata: Metadata = {
  title: "Upsell Purchase Successful | Tools Australia",
  description: "Thank you for your upsell purchase! Your additional entries have been added to your account.",
  keywords: "upsell success, purchase confirmed, tools australia, additional entries",
};

// Mark page as dynamic to prevent static generation issues with searchParams
export const dynamic = "force-dynamic";

interface UpsellSuccessPageProps {
  searchParams: Promise<{
    payment_intent_client_secret?: string;
    payment_intent?: string;
  }>;
}

export default async function UpsellSuccessPage({ searchParams }: UpsellSuccessPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-neutral-400 font-medium">Loading payment details...</p>
        </div>
      }
    >
      <div className="min-h-screen-svh bg-gray-50">
        <UpsellSuccessClient searchParams={resolvedSearchParams} />
      </div>
    </Suspense>
  );
}
