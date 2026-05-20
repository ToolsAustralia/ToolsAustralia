"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AREA_ACTIONS, AREAS, type Area, type Permission } from "@/lib/permissions";
import { MOCK_ROLES } from "./mockData";

// Mock permission sets per role for the preview only (no API). Picks a
// sensible per-role grant so the toggles look believable when clicking
// between roles. The real component (Task 20) reads from the DB.
const MOCK_ROLE_PERMS: Record<string, ReadonlySet<Permission>> = {
  r1: new Set(
    AREAS.flatMap((a) => AREA_ACTIONS[a].map((act) => `${a}.${act}` as Permission))
  ),
  r2: new Set<Permission>([
    "overview.view",
    "facebookAds.view",
    "facebookAds.edit",
    "pageAnalytics.view",
    "promoAnalytics.view",
    "abTesting.view",
  ]),
  r3: new Set<Permission>([
    "overview.view",
    "submissions.view",
    "users.view",
    "users.edit",
  ]),
  r4: new Set<Permission>(["overview.view", "promos.view", "promos.edit"]),
};

function formatAreaLabel(a: string) {
  return a.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatActionLabel(a: string) {
  // camelCase → human-readable
  return a.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

// Actions that warrant a visual warning (destructive / irreversible / money).
const DANGER_ACTIONS = new Set([
  "delete",
  "charge",
  "refund",
  "cancelSubscription",
  "selectWinner",
  "processPayout",
  "end",
]);

export default function RolesPreview() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_ROLES[1]?.id ?? MOCK_ROLES[0]!.id);
  const selected = MOCK_ROLES.find((r) => r.id === selectedId) ?? MOCK_ROLES[0]!;
  const isAdminRole = selected.name === "Admin";
  const perms = MOCK_ROLE_PERMS[selected.id] ?? new Set<Permission>();

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

          <div className="space-y-2">
            {AREAS.map((area) => (
              <AreaRow
                key={area}
                area={area}
                perms={perms}
                disabled={isAdminRole}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AreaRow({
  area,
  perms,
  disabled,
}: {
  area: Area;
  perms: ReadonlySet<Permission>;
  disabled: boolean;
}) {
  const actions = AREA_ACTIONS[area];
  const grantedCount = actions.filter((a) =>
    perms.has(`${area}.${a}` as Permission)
  ).length;
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-neutral-950/40">
      <div className="w-40 flex-shrink-0">
        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
          {formatAreaLabel(area)}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-500">
          {grantedCount}/{actions.length} actions
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {actions.map((action) => {
          const perm = `${area}.${action}` as Permission;
          const on = perms.has(perm);
          return (
            <ActionPill
              key={perm}
              label={formatActionLabel(action)}
              on={on}
              disabled={disabled}
              danger={DANGER_ACTIONS.has(action)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ActionPill({
  label,
  on,
  disabled,
  danger,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  // Three visual states:
  //  - on + danger  → red-tinted (charge / delete / refund / cancelSub / selectWinner / processPayout / end)
  //  - on           → brand red gradient (normal grant)
  //  - off          → neutral outline
  const className = on
    ? danger
      ? "bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300"
      : "bg-gradient-to-r from-[#ee0000] to-[#ff4444] border border-transparent text-white shadow-sm shadow-red-500/20"
    : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600";

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${className} ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      {label}
    </button>
  );
}
