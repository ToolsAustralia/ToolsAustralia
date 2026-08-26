"use client";

import React from "react";

/** Mobile full-width treatment for the date control, inside the admin header slot. */
export function AdminMobileLayoutDateRangeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex justify-center">
      <div className="w-full min-w-0 lg:w-auto">{children}</div>
    </div>
  );
}
