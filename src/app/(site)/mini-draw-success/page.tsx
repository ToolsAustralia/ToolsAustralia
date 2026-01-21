import { Metadata } from "next";
import { Suspense } from "react";
import MiniDrawSuccessClient from "./components/MiniDrawSuccessClient";

export const metadata: Metadata = {
  title: "Mini Draw Entry Successful | Tools Australia",
  description: "Thank you for your mini draw purchase! Your entry has been added to the draw.",
  keywords: "mini draw success, entry confirmed, tools australia, draw entry",
};

// Mark page as dynamic to prevent static generation issues with searchParams
export const dynamic = "force-dynamic";

interface MiniDrawSuccessPageProps {
  searchParams: Promise<{
    payment_intent_client_secret?: string;
    payment_intent?: string;
  }>;
}

export default async function MiniDrawSuccessPage({ searchParams }: MiniDrawSuccessPageProps) {
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
        <MiniDrawSuccessClient searchParams={resolvedSearchParams} />
      </div>
    </Suspense>
  );
}
