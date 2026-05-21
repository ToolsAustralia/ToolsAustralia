"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPasswordResetEmailTemplate } from "@/lib/email/templates";

const PasswordResetEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const resetUrl = `${origin.replace(/\/$/, "")}/reset-password?token=preview-mock-token`;
    return createPasswordResetEmailTemplate("Alex Taylor", resetUrl, 60);
  }, [mounted]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Password Reset Email Preview</h3>
        <span className="w-fit rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
          SendGrid · templates.ts
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[900px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Password reset email preview"
            srcDoc={emailHtml}
            className="h-[900px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default PasswordResetEmailPreview;
