import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CancellationFlowHarnessClient from "./CancellationFlowHarnessClient";

/**
 * Development-only: preview the cancellation-flow modal steps in every state
 * with mock no-network handlers. Returns 404 in production.
 */

export const metadata: Metadata = {
  title: "Cancellation flow (dev) | Tools Australia",
  description: "Development-only cancellation-flow component preview harness",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DevCancellationFlowPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <CancellationFlowHarnessClient />;
}
