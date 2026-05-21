"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPartnerApplicationEmailTemplate } from "@/lib/email/templates";

const PartnerApplicationEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    return createPartnerApplicationEmailTemplate({
      firstName: "Jordan",
      lastName: "Lee",
      businessName: "Example Trade Supplies Pty Ltd",
      email: "jordan.lee@example.com.au",
      phone: "0499 888 777",
      abn: "12 345 678 901",
      acn: "",
      goals: "We would like to discuss stocking Tools Australia products in our wholesale channel.",
      submittedAt: new Date("2026-04-06T09:15:00+10:00"),
    });
  }, [mounted]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Partner Application Notification Preview</h3>
        <span className="w-fit rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
          SendGrid · templates.ts
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[1000px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Partner application email preview"
            srcDoc={emailHtml}
            className="h-[1000px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default PartnerApplicationEmailPreview;
