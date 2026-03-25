"use client";

import React from "react";

/** Same typography/full-width treatment as OverviewToolbar `placement="layout"` */
export function AdminMobileLayoutDateRangeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex justify-center">
      <div className="w-full min-w-0 lg:w-auto">{children}</div>
    </div>
  );
}
