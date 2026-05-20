"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AREAS } from "@/lib/permissions";
import { MOCK_ROLES, MOCK_PERMISSION_GRID } from "./mockData";

function formatAreaLabel(a: string) {
  return a.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export default function RolesPreview() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_ROLES[1]?.id ?? MOCK_ROLES[0]!.id);
  const selected = MOCK_ROLES.find((r) => r.id === selectedId) ?? MOCK_ROLES[0]!;
  const isAdminRole = selected.name === "Admin";

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[520px] bg-gray-50 dark:bg-neutral-950 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
      {/* Roles list (Discord-style left rail) */}
      <aside className="w-72 bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Roles</h3>
          <button
            type="button"
            aria-label="New role"
            className="p-1.5 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white hover:shadow-lg hover:shadow-red-500/20 transition-shadow"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {MOCK_ROLES.map((r) => {
            const active = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    active
                      ? "bg-gray-100 dark:bg-neutral-800 ring-1 ring-inset ring-gray-200 dark:ring-gray-700"
                      : "hover:bg-gray-50 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: r.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                      <span className="truncate">{r.name}</span>
                      {r.isSystem && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                          System
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {r.memberCount} member{r.memberCount === 1 ? "" : "s"} · {r.permissionCount} perms
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Editor pane */}
      <section className="flex-1 overflow-y-auto bg-white dark:bg-neutral-900">
        <header className="flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-5 h-5 rounded ring-2 ring-white dark:ring-neutral-900 shadow-sm flex-shrink-0"
              style={{ background: selected.color }}
            />
            <input
              defaultValue={selected.name}
              disabled={selected.isSystem}
              className="text-2xl font-bold bg-transparent outline-none text-gray-900 dark:text-gray-100 disabled:opacity-70 min-w-0 truncate"
            />
            {isAdminRole && (
              <span className="text-[10px] uppercase tracking-wide font-semibold text-[#ee0000] dark:text-[#ff4444] bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">
                Super-role
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={selected.isSystem || selected.memberCount > 0}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </header>

        <div className="p-8">
          {isAdminRole && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              The Admin role has every permission and is managed by the seed script. Toggles are read-only.
            </p>
          )}

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-neutral-950 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left py-3 px-4">Area</th>
                  <th className="py-3 px-4 w-32 text-center">View</th>
                  <th className="py-3 px-4 w-32 text-center">Edit</th>
                </tr>
              </thead>
              <tbody>
                {AREAS.map((a) => {
                  const row = MOCK_PERMISSION_GRID.find((r) => r.area === a)!;
                  const viewOn = isAdminRole ? true : row.adsManager.view;
                  const editOn = isAdminRole ? true : row.adsManager.edit;
                  return (
                    <tr
                      key={a}
                      className="border-t border-gray-200 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-neutral-800/40"
                    >
                      <td className="py-3 px-4 text-gray-900 dark:text-gray-100">{formatAreaLabel(a)}</td>
                      <td className="py-3 px-4 text-center">
                        <TogglePill on={viewOn} disabled={isAdminRole} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <TogglePill on={editOn} disabled={isAdminRole} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function TogglePill({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${
        on
          ? "bg-gradient-to-r from-[#ee0000] to-[#ff4444]"
          : "bg-gray-200 dark:bg-neutral-700"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:brightness-110"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
