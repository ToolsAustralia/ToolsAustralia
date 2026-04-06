"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createContactSubmissionEmailTemplate } from "@/lib/email/templates";

const ContactSubmissionEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(() => {
    if (!mounted) return "";
    return createContactSubmissionEmailTemplate({
      firstName: "Sam",
      lastName: "Jordan",
      email: "sam.jordan@example.com",
      phone: "0412 345 678",
      subject: "Question about delivery",
      message: "Hi,\n\nCould you confirm if my order will arrive before Friday?\n\nThanks!",
      submittedAt: new Date("2026-04-07T14:30:00+10:00"),
    });
  }, [mounted]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Contact Form Notification Preview</h3>
        <span className="w-fit rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
          SendGrid · templates.ts
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[900px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Contact submission email preview"
            srcDoc={emailHtml}
            className="h-[900px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default ContactSubmissionEmailPreview;
