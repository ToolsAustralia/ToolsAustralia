"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createStaffInviteEmailTemplate } from "@/lib/email/templates";

/** Staff invite (SendGrid) — code-as-source, rendered live from templates.ts like the other SendGrid emails. */
const StaffInvitePreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const inviteLink = `${origin.replace(/\/$/, "")}/staff-setup/preview-mock-token`;
    return createStaffInviteEmailTemplate({
      inviteeName: "Maya Nguyen",
      roleName: "Operations Manager",
      inviteLink,
      inviterName: "DJ Rivera",
      expiresIn: "7 days",
    });
  }, [mounted]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Staff Invite Email Preview</h3>
        <span className="w-fit rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
          SendGrid · templates.ts
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[900px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Staff invite email preview"
            srcDoc={emailHtml}
            className="h-[900px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default StaffInvitePreview;
