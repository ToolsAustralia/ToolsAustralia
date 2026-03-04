"use client";

import React from "react";

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

export function getStatusColor(status: string) {
  switch (status) {
    case "pending":
    case "new":
      return "bg-yellow-100 text-yellow-800";
    case "under_review":
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "approved":
    case "resolved":
      return "bg-green-100 text-green-800";
    case "rejected":
    case "closed":
      return "bg-red-100 text-red-800";
    case "contacted":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
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
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
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
