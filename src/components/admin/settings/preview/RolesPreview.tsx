"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { AREA_ACTIONS, AREAS, type Area, type Permission } from "@/lib/permissions";
import { AREA_META, PERMISSION_META } from "@/lib/permission-descriptions";
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

export default function RolesPreview() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_ROLES[1]?.id ?? MOCK_ROLES[0]!.id);
  const selected = MOCK_ROLES.find((r) => r.id === selectedId) ?? MOCK_ROLES[0]!;
  const isAdminRole = selected.name === "Admin";
  const perms = MOCK_ROLE_PERMS[selected.id] ?? new Set<Permission>();
  const [collapsed, setCollapsed] = useState<Set<Area>>(new Set());

  function toggleCollapsed(area: Area) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

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
        <header className="flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur z-10">
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

        <div className="p-8 space-y-3">
          {isAdminRole && (
            <div className="mb-2 px-4 py-3 rounded-lg bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-300">
              The Admin role has every permission and is managed by the seed script. Toggles are read-only here.
            </div>
          )}

          {AREAS.map((area) => (
            <AreaSection
              key={area}
              area={area}
              perms={perms}
              disabled={isAdminRole}
              collapsed={collapsed.has(area)}
              onToggleCollapsed={() => toggleCollapsed(area)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AreaSection({
  area,
  perms,
  disabled,
  collapsed,
  onToggleCollapsed,
}: {
  area: Area;
  perms: ReadonlySet<Permission>;
  disabled: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const meta = AREA_META[area];
  const actions = AREA_ACTIONS[area];
  const grantedCount = actions.filter((a) =>
    perms.has(`${area}.${a}` as Permission)
  ).length;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 dark:bg-neutral-950/60 hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors text-left"
      >
        <ChevronDown
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${
            collapsed ? "-rotate-90" : "rotate-0"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{meta.label}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {grantedCount} of {actions.length} granted
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {meta.description}
          </p>
        </div>
      </button>

      {!collapsed && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {actions.map((action) => {
            const perm = `${area}.${action}` as Permission;
            const pmeta = PERMISSION_META[perm];
            const on = perms.has(perm);
            return (
              <li key={perm}>
                <ActionRow
                  label={pmeta.label}
                  description={pmeta.description}
                  on={on}
                  danger={pmeta.danger}
                  disabled={disabled}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActionRow({
  label,
  description,
  on,
  danger,
  disabled,
}: {
  label: string;
  description: string;
  on: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  // Entire row is the click target — toggling the toggle and clicking the
  // description do the same thing. Discord-style.
  const labelColor = danger
    ? "text-red-700 dark:text-red-400"
    : "text-gray-900 dark:text-gray-100";

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-80"
          : "hover:bg-gray-50 dark:hover:bg-neutral-800/60 cursor-pointer"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${labelColor}`}>{label}</span>
          {danger && (
            <span className="text-[10px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400">
              Sensitive
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <ToggleSwitch on={on} danger={danger} disabled={disabled} />
    </button>
  );
}

function ToggleSwitch({
  on,
  danger,
  disabled,
}: {
  on: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const onColor = danger
    ? "bg-gradient-to-r from-red-600 to-red-500"
    : "bg-gradient-to-r from-[#ee0000] to-[#ff4444]";
  const offColor = "bg-gray-200 dark:bg-neutral-700";
  return (
    <span
      role="presentation"
      aria-hidden
      className={`mt-0.5 relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        on ? onColor : offColor
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}
