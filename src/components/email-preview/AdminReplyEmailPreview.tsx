"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createAdminReplyEmailTemplate } from "@/lib/email/templates";

const MOCK_HTML_MESSAGE = `<p>Thanks for getting in touch.</p><p>I've looked into your question and we can <strong>expedite shipping</strong> for orders placed before 2pm AEST.</p><p>Let me know if you need anything else.</p>`;

const AdminReplyEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [submissionType, setSubmissionType] = useState<"contact" | "partner">("contact");
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    return createAdminReplyEmailTemplate("Sam Jordan", MOCK_HTML_MESSAGE, submissionType);
  }, [mounted, submissionType]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Admin Reply Email Preview</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-fit rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
            SendGrid · templates.ts
          </span>
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs font-medium dark:border-neutral-600">
            <button
              type="button"
              onClick={() => setSubmissionType("contact")}
              className={`rounded-md px-2.5 py-1 ${submissionType === "contact" ? "bg-gray-900 text-white" : "text-gray-600"}`}
            >
              Contact
            </button>
            <button
              type="button"
              onClick={() => setSubmissionType("partner")}
              className={`rounded-md px-2.5 py-1 ${submissionType === "partner" ? "bg-gray-900 text-white" : "text-gray-600"}`}
            >
              Partner
            </button>
          </div>
        </div>
      </div>
      <p className="mb-3 text-sm text-gray-600 dark:text-neutral-400">
        Sample HTML reply (rich text) as sent from support. Header subtitle reflects contact vs partner inquiry.
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[800px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Admin reply email preview"
            srcDoc={emailHtml}
            className="h-[800px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default AdminReplyEmailPreview;
