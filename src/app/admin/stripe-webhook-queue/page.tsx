import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import QueueTable from "./QueueTable";

export const dynamic = "force-dynamic";

export default async function StripeWebhookQueuePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    redirect("/login");
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
