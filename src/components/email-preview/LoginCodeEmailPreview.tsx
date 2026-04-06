"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createLoginCodeEmailTemplate } from "@/lib/email/templates";

const LoginCodeEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    return createLoginCodeEmailTemplate("Alex Taylor", "482910", 15);
  }, [mounted]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Login Code Email Preview</h3>
        <span className="w-fit rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
          SendGrid · templates.ts
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[1000px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Login code email preview"
            srcDoc={emailHtml}
            className="h-[1000px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default LoginCodeEmailPreview;
