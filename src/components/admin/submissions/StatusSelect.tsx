"use client";

import React from "react";
import { AdminBadge, type AdminBadgeVariant } from "@/components/admin/ui/AdminBadge";

interface StatusSelectProps {
  type: "partner" | "contact";
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
}

const PARTNER_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "contacted", label: "Contacted" },
];

const CONTACT_STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

/** Maps submission workflow status to admin badge variant */
export function submissionStatusVariant(status: string): AdminBadgeVariant {
  switch (status) {
    case "pending":
    case "new":
      return "warning";
    case "under_review":
    case "in_progress":
      return "info";
    case "approved":
    case "resolved":
      return "success";
    case "rejected":
    case "closed":
      return "danger";
    case "contacted":
      return "tagViolet";
    default:
      return "neutral";
  }
}

/** @deprecated Use SubmissionStatusBadge or submissionStatusVariant + AdminBadge */
export function getStatusColor(status: string) {
  const v = submissionStatusVariant(status);
  const map: Record<AdminBadgeVariant, string> = {
    neutral: "bg-slate-100 text-slate-800 dark:bg-neutral-800 dark:text-neutral-200",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-900 dark:bg-amber-950/45 dark:text-amber-200",
    danger: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    info: "bg-sky-100 text-sky-900 dark:bg-sky-950/45 dark:text-sky-200",
    tagBlue: "bg-blue-100 text-blue-800",
    tagEmerald: "bg-emerald-100 text-emerald-800",
    tagViolet: "bg-violet-100 text-violet-900 dark:bg-violet-950/45 dark:text-violet-200",
    tagOrange: "bg-orange-100 text-orange-900",
    tagPink: "bg-pink-100 text-pink-900",
    tagAmber: "bg-amber-100 text-amber-900",
  };
  return map[v] ?? map.neutral;
}

export function SubmissionStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return <AdminBadge variant={submissionStatusVariant(status)}>{label}</AdminBadge>;
}

export default function StatusSelect({
  type,
  value,
  onChange,
  onSave,
  saving,
}: StatusSelectProps) {
  const statuses = type === "partner" ? PARTNER_STATUSES : CONTACT_STATUSES;

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:ring-2 focus:ring-red-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
      >
        {saving ? "Saving..." : "Update"}
      </button>
    </div>
  );
}
