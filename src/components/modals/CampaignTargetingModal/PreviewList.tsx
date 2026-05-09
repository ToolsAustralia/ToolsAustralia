"use client";

import React from "react";
import { formatDisplayName } from "@/utils/display-name";
import type { FilterUserRow } from "./types";

function tierBadgeClass(packageId: string | undefined): string {
  if (packageId === "tradie-subscription") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (packageId === "foreman-subscription") return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  if (packageId === "boss-subscription") return "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200";
  return "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";
}

interface PreviewListProps {
  users: FilterUserRow[];
  selectedUserIds: Set<string>;
  previewLoading: boolean;
  onToggleUser: (id: string) => void;
}

export default function PreviewList({ users, selectedUserIds, previewLoading, onToggleUser }: PreviewListProps) {
  return (
    <>
      {!users.length && !previewLoading && (
        <div className="py-8 sm:py-12 text-center text-gray-500 dark:text-neutral-400 text-sm">
          Set filters and click <strong>Preview audience</strong> to load users.
        </div>
      )}
      {users.length > 0 && (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedUserIds.has(u.id)
                  ? "border-red-500 bg-red-50/80 dark:bg-red-950/20"
                  : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/50 hover:border-gray-300"
              }`}
              onClick={() => onToggleUser(u.id)}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedUserIds.has(u.id)}
                onChange={() => onToggleUser(u.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatDisplayName(u.firstName, u.lastName)}
                  </span>
                  {u.subscription?.packageId && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierBadgeClass(u.subscription.packageId)}`}>
                      {u.subscription.packageName || u.subscription.packageId}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-neutral-400">{u.state || "—"}</span>
                  <span className="text-xs text-gray-500 dark:text-neutral-400 tabular-nums">
                    Draw entries: {u.majorDrawEntries}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-neutral-400 truncate">{u.email}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
