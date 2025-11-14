"use client";

import React, { useState } from "react";
import InvoicePreview from "./InvoicePreview";
import VerificationEmailPreview from "./VerificationEmailPreview";

/**
 * Email Preview Layout Component
 *
 * Container component that provides tab navigation to switch between
 * different email template previews (Invoice and Verification).
 */
const EmailPreviewLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"invoice" | "verification">("invoice");

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Email Template Previews</h1>
          <p className="mt-2 text-gray-600">
            Preview all email templates before deploying to Klaviyo. This page is only accessible in development mode.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("invoice")}
              className={`-mb-px rounded-t-lg border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === "invoice"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              Invoice Email
            </button>
            <button
              onClick={() => setActiveTab("verification")}
              className={`-mb-px rounded-t-lg border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === "verification"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              Verification Email
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="rounded-lg bg-white p-6 shadow-sm">
          {activeTab === "invoice" && <InvoicePreview />}
          {activeTab === "verification" && <VerificationEmailPreview />}
        </div>

        {/* Footer Info */}
        <div className="mt-8 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Note:</p>
          <p className="mt-1">
            These previews use mock data for demonstration purposes. The actual emails sent through Klaviyo will use
            real customer and transaction data.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmailPreviewLayout;
