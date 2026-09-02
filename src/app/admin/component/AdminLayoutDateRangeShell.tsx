"use client";

import React from "react";

/**
 * Wrapper for the date control inside the admin header slot.
 *
 * Below `lg` the control goes full-width so it is comfortably tappable on a narrow header.
 * At `lg` and up it must shrink to its content — the desktop header row lays the slot out next
 * to the theme toggle, and a `w-full` child there would push the toggle off the row.
 */
export function AdminLayoutDateRangeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full lg:w-auto flex justify-center">
      <div className="w-full min-w-0 lg:w-auto">{children}</div>
    </div>
  );
}
