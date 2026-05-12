"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import QueueTable from "./QueueTable";

export default function StripeWebhookQueuePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (status === "loading") return; // Still loading

    if (!session || session.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === "loading") {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
      </div>
    );
  }

  // Don't render if not authenticated or not admin
  if (!session || session.user?.role !== "admin") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Stripe Webhook Queue</h1>
      <p className="mb-6 text-sm text-gray-600">
        Async processing pipeline for Stripe webhook events. Rows shown in reverse-chronological
        order. Use the status filter to focus on failures or in-flight events.
      </p>
      <QueueTable />
    </div>
  );
}
