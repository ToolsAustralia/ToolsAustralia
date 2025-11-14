import { notFound } from "next/navigation";
import { Metadata } from "next";
import { EmailPreviewLayout } from "@/components/email-preview";

/**
 * Email Preview Page
 *
 * Development-only page for previewing email templates before deployment.
 * Returns 404 in production for security.
 */

export const metadata: Metadata = {
  title: "Email Template Previews | Tools Australia",
  description: "Development-only page for previewing email templates",
  robots: {
    index: false,
    follow: false,
  },
};

export default function EmailPreviewPage() {
  // Only allow access in development mode
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <EmailPreviewLayout />;
}
