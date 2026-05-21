"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createVerificationEmailTemplate } from "@/lib/email/templates";

/**
 * Verification Email Preview Component
 *
 * Renders `createVerificationEmailTemplate` from `@/lib/email/templates` with mock data.
 */
const VerificationEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mockUserName = "John Smith";
  const mockVerificationCode = "ABC123";

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    return createVerificationEmailTemplate(mockUserName, mockVerificationCode);
  }, [mounted, mockUserName, mockVerificationCode]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Email Verification Preview</h3>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
          Verification Email
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="h-[1000px] w-full flex items-center justify-center text-gray-500">
            Loading preview...
          </div>
        ) : (
          <iframe
            title="Email Verification Preview"
            srcDoc={emailHtml}
            className="h-[1000px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default VerificationEmailPreview;
