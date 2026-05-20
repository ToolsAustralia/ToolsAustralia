"use client";

import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import RolesPreview from "@/components/admin/settings/preview/RolesPreview";
import StaffPreview from "@/components/admin/settings/preview/StaffPreview";

export default function SettingsPreviewPage() {
  const { has, isLoading } = usePermissions();
  const [tab, setTab] = useState<"staff" | "roles">("staff");

  if (isLoading) {
    return (
      <div className="p-10 text-gray-700 dark:text-gray-300">Loading…</div>
    );
  }
  if (!has("settings.view")) {
    return (
      <div className="p-10 text-gray-700 dark:text-gray-300">
        You don&apos;t have permission to view settings.
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 bg-white dark:bg-neutral-950 min-h-screen-svh">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Settings — Preview
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Visual mockup for review. No data is saved. Mock data only.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6">
        {(["staff", "roles"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? "text-[#ee0000] dark:text-[#ff4444] border-b-2 border-[#ee0000] dark:border-[#ff4444]"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "staff" ? <StaffPreview /> : <RolesPreview />}
    </div>
  );
}
