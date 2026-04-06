"use client";

import React, { useState } from "react";
import InvoicePreview from "./InvoicePreview";
import VerificationEmailPreview from "./VerificationEmailPreview";
import PasswordResetEmailPreview from "./PasswordResetEmailPreview";
import LoginCodeEmailPreview from "./LoginCodeEmailPreview";
import ContactSubmissionEmailPreview from "./ContactSubmissionEmailPreview";
import PartnerApplicationEmailPreview from "./PartnerApplicationEmailPreview";
import AdminReplyEmailPreview from "./AdminReplyEmailPreview";
import PaymentFailedPreview from "./PaymentFailedPreview";
import SubscriptionRenewalPreview from "./SubscriptionRenewalPreview";
import MiniDrawFullCapacityPreview from "./MiniDrawFullCapacityPreview";

export type EmailPreviewTabId =
  | "invoice"
  | "verification"
  | "password-reset"
  | "login-code"
  | "contact"
  | "partner"
  | "admin-reply"
  | "payment-failed"
  | "subscription-renewal"
  | "mini-draw-full";

const PREVIEW_TABS: { id: EmailPreviewTabId; label: string }[] = [
  { id: "invoice", label: "Invoice (Klaviyo)" },
  { id: "verification", label: "Verification" },
  { id: "password-reset", label: "Password reset" },
  { id: "login-code", label: "Login code" },
  { id: "contact", label: "Contact notify" },
  { id: "partner", label: "Partner notify" },
  { id: "admin-reply", label: "Admin reply" },
  { id: "payment-failed", label: "Payment failed (Klaviyo)" },
  { id: "subscription-renewal", label: "Subscription renewal (Klaviyo)" },
  { id: "mini-draw-full", label: "Mini draw 100%" },
];

/**
 * Email Preview Layout — dev-only page body (`/email-preview`).
 * SendGrid tabs use live functions from `@/lib/email/templates`; Klaviyo tabs mirror static HTML previews.
 */
const EmailPreviewLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EmailPreviewTabId>("invoice");

  function renderPanel() {
    switch (activeTab) {
      case "invoice":
        return <InvoicePreview />;
      case "verification":
        return <VerificationEmailPreview />;
      case "password-reset":
        return <PasswordResetEmailPreview />;
      case "login-code":
        return <LoginCodeEmailPreview />;
      case "contact":
        return <ContactSubmissionEmailPreview />;
      case "partner":
        return <PartnerApplicationEmailPreview />;
      case "admin-reply":
        return <AdminReplyEmailPreview />;
      case "payment-failed":
        return <PaymentFailedPreview />;
      case "subscription-renewal":
        return <SubscriptionRenewalPreview />;
      case "mini-draw-full":
        return <MiniDrawFullCapacityPreview />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8 dark:from-neutral-950 dark:to-neutral-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-neutral-100">Email template previews</h1>
          <p className="mt-2 text-gray-600 dark:text-neutral-400">
            <strong>SendGrid</strong> rows render HTML from{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-neutral-800">src/lib/email/templates.ts</code>.{" "}
            <strong>Klaviyo</strong> tabs mirror the dev previews; the <strong>source of truth for pasting into Klaviyo</strong> is the
            hardened HTML at the repo root:{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-neutral-800">invoice-email-template.html</code>,{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-neutral-800">subscription-renewal-email-template.html</code>,{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-neutral-800">subscription-payment-failed-email-template.html</code>{" "}
            (signup/membership payment failed), and{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-neutral-800">renewal-failed-email-template.html</code> (renewal failed). This
            page is only available in development.
          </p>
        </div>

        <div className="mb-6">
          <nav className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-neutral-700">
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`-mb-px rounded-t-lg border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-neutral-900 dark:ring-1 dark:ring-neutral-800">
          {renderPanel()}
        </div>

        <div className="mt-8 rounded-lg bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          <p className="font-semibold">Note</p>
          <p className="mt-1">
            Mock data is used for all previews. Klaviyo campaigns receive merged profile and event properties; SendGrid
            transactional emails use the same template functions as production (with real data at send time).
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmailPreviewLayout;
