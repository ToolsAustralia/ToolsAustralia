"use client";

import React, { useState, useEffect } from "react";
import { createMiniDrawFullCapacityTemplate } from "@/lib/email/templates";

/**
 * Mini Draw Full Capacity Email Preview Component
 *
 * Displays a preview of the mini draw 100% capacity notification template
 * using the actual createMiniDrawFullCapacityTemplate function.
 */
const MiniDrawFullCapacityPreview: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const baseUrl = mounted && typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const adminUrl = baseUrl.replace(/\/$/, "");
  const notifiedAt = new Date();

  const emailHtml = createMiniDrawFullCapacityTemplate({
    miniDrawName: "KNIPEX Mixed Plier Foam Tray Set - 4 Piece 002001V08",
    prizeName: "KNIPEX Mixed Plier Foam Tray Set - 4 Piece 002001V08",
    totalEntries: 650,
    minimumEntries: 650,
    adminUrl,
    notifiedAt,
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-800 dark:text-neutral-100">Mini Draw 100% Capacity Notification Preview</h3>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          Admin Notification
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {!mounted ? (
          <div className="h-[800px] w-full flex items-center justify-center text-gray-500">
            Loading preview...
          </div>
        ) : (
          <iframe
            title="Mini Draw 100% Capacity Email Preview"
            srcDoc={emailHtml}
            className="h-[800px] w-full border-0"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default MiniDrawFullCapacityPreview;
