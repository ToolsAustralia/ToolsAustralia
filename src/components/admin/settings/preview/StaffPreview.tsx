"use client";

import { Crown, Plus, Search, Send, Trash2 } from "lucide-react";
import { MOCK_ROLES, MOCK_STAFF } from "./mockData";

export default function StaffPreview() {
  return (
    <div className="bg-gray-50 dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search staff…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          />
        </div>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white font-medium hover:shadow-lg hover:shadow-red-500/20 transition-shadow"
        >
          <Plus className="w-4 h-4" /> Invite staff
        </button>
      </header>

      <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-neutral-900">
        {MOCK_STAFF.map((s) => (
          <li
            key={s.id}
            className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ring-2 ring-white dark:ring-neutral-900 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${s.roleColor}, ${s.roleColor}cc)` }}
              aria-hidden
            >
              {s.firstName[0]}
              {s.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                {s.firstName} {s.lastName}
                {s.userType === "admin" && (
                  <Crown
                    className="w-3.5 h-3.5 text-[#ee0000] dark:text-[#ff4444]"
                    aria-label="Super-admin"
                  />
                )}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{s.email}</div>
            </div>

            <select
              defaultValue={s.roleId}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
            >
              {MOCK_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <StatusBadge status={s.inviteStatus} />

            <div className="flex gap-1">
              {s.inviteStatus !== "active" && (
                <button
                  type="button"
                  title="Resend invite"
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                title="Remove"
                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "pending" | "expired" }) {
  const styles = {
    active:  "bg-green-100  dark:bg-green-950/50  text-green-700  dark:text-green-400",
    pending: "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-400",
    expired: "bg-red-100    dark:bg-red-950/50    text-red-700    dark:text-red-400",
  } as const;
  const label =
    status === "active" ? "Active" : status === "pending" ? "Invited" : "Expired";
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-md ${styles[status]}`}>
      {label}
    </span>
  );
}
