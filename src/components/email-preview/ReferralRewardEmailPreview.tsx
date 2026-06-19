"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createReferralRewardEmailTemplate } from "@/lib/email/templates";

/** Referral reward email (SendGrid, sent to both referrer + referred friend). Renders the live template fn with mock data. */
const ReferralRewardEmailPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailHtml = useMemo(
    () =>
      mounted
        ? createReferralRewardEmailTemplate("John", "Dave", 100, "https://toolsaustralia.com.au/my-account")
        : "",
    [mounted]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Referral reward (SendGrid)</h3>
        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">SendGrid · both parties</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="flex h-[1000px] w-full items-center justify-center text-gray-500">Loading preview...</div>
        ) : (
          <iframe
            title="Referral reward"
            srcDoc={emailHtml}
            className="h-[1000px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default ReferralRewardEmailPreview;
