"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  AREA_ACTIONS,
  AREAS,
  type Area,
  type Permission,
} from "@/lib/permissions";
import { AREA_META, PERMISSION_META } from "@/lib/permission-descriptions";

// Preset role colors. Custom hex is not exposed yet — keep the palette small.
const ROLE_COLOR_PRESETS = [
  "#ee0000", // brand red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
] as const;
const DEFAULT_NEW_ROLE_COLOR = ROLE_COLOR_PRESETS[3]; // blue — distinct from Admin red

interface ApiRole {
  id: string;
  name: string;
  color: string | null;
  permissions: Permission[];
  isSystem: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

interface RolesResponse {
  success: true;
  data: { roles: ApiRole[]; catalog: Permission[] };
}

async function fetchRoles(): Promise<RolesResponse> {
  const r = await fetch("/api/admin/roles");
  if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to load roles");
  return r.json();
}

async function safeError(r: Response): Promise<string | null> {
  try {
    const data = await r.json();
    return typeof data?.error === "string" ? data.error : null;
  } catch {
    return null;
  }
}

export default function RolesManagement() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<RolesResponse>({
    queryKey: ["admin", "roles"],
    queryFn: fetchRoles,
  });

  const roles = data?.data.roles ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? roles.find((r) => r.id === selectedId) ?? null : null;
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Default selection: first non-system role (or first if only Admin exists).
  useEffect(() => {
    if (selectedId || roles.length === 0) return;
    const first = roles.find((r) => !r.isSystem) ?? roles[0];
    setSelectedId(first?.id ?? null);
  }, [roles, selectedId]);

  if (isLoading) {
    return (
      <div className="p-10 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading roles…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-10 text-red-600 dark:text-red-400">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[520px] bg-gray-50 dark:bg-neutral-950 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
      <RolesSidebar
        roles={roles}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={() => setCreating(true)}
      />

      {selected ? (
        <RoleEditor
          key={selected.id}
          role={selected}
          onDeleteRequest={() => setDeletingId(selected.id)}
        />
      ) : (
        <div className="flex-1 grid place-items-center text-gray-500 dark:text-gray-400 text-sm">
          {roles.length === 0
            ? "No roles yet. Click the + to create one."
            : "Select a role on the left."}
        </div>
      )}

      {creating && (
        <CreateRoleModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            qc.invalidateQueries({ queryKey: ["admin", "roles"] });
          }}
        />
      )}

      {deletingId && (
        <DeleteRoleModal
          role={roles.find((r) => r.id === deletingId)!}
          onClose={() => setDeletingId(null)}
          onDeleted={() => {
            setDeletingId(null);
            if (selectedId === deletingId) setSelectedId(null);
            qc.invalidateQueries({ queryKey: ["admin", "roles"] });
          }}
        />
      )}
    </div>
  );
}

function RolesSidebar({
  roles,
  selectedId,
  onSelect,
  onCreate,
}: {
  roles: ApiRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="w-72 bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Roles</h3>
        <button
          type="button"
          onClick={onCreate}
          aria-label="New role"
          className="p-1.5 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white hover:shadow-lg hover:shadow-red-500/20 transition-shadow"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {roles.map((r) => {
          const active = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active
                    ? "bg-gray-100 dark:bg-neutral-800 ring-1 ring-inset ring-gray-200 dark:ring-gray-700"
                    : "hover:bg-gray-50 dark:hover:bg-neutral-800/60"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: r.color ?? "#9ca3af" }}
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
                    {r.memberCount} member{r.memberCount === 1 ? "" : "s"} ·{" "}
                    {r.permissions.length} perms
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function RoleEditor({
  role,
  onDeleteRequest,
}: {
  role: ApiRole;
  onDeleteRequest: () => void;
}) {
  const qc = useQueryClient();
  const isAdminRole = role.name === "Admin";
  const adminPermsLocked = isAdminRole; // permissions immutable for Admin
  const nameLocked = role.isSystem; // system role names immutable

  const [name, setName] = useState(role.name);
  const [color, setColor] = useState<string>(role.color ?? "#9ca3af");
  const initialPerms = useMemo(() => new Set<Permission>(role.permissions), [role]);
  const [perms, setPerms] = useState<Set<Permission>>(new Set(initialPerms));
  const [collapsed, setCollapsed] = useState<Set<Area>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    name !== role.name ||
    (color ?? "#9ca3af") !== (role.color ?? "#9ca3af") ||
    !setsEqual(perms, initialPerms);

  function togglePerm(p: Permission) {
    if (adminPermsLocked) return;
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleCollapsed(area: Area) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  function discard() {
    setName(role.name);
    setColor(role.color ?? "#9ca3af");
    setPerms(new Set(initialPerms));
    setSaveError(null);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (!nameLocked && name !== role.name) body.name = name;
      if (color && color !== role.color) body.color = color;
      if (!adminPermsLocked && !setsEqual(perms, initialPerms)) {
        body.permissions = Array.from(perms);
      }
      if (Object.keys(body).length === 0) return;
      const r = await fetch(`/api/admin/roles/${role.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to save");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "roles"] });
    },
    onError: (e: unknown) => {
      setSaveError((e as Error).message);
    },
  });

  return (
    <section className="flex-1 overflow-y-auto bg-white dark:bg-neutral-900">
      <header className="flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur z-10">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ColorSwatch
            color={color}
            onChange={setColor}
            disabled={adminPermsLocked /* admin color is locked too */}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={nameLocked}
            maxLength={60}
            className="text-2xl font-bold bg-transparent outline-none text-gray-900 dark:text-gray-100 disabled:opacity-70 min-w-0 flex-1 truncate"
          />
          {isAdminRole && (
            <span className="text-[10px] uppercase tracking-wide font-semibold text-[#ee0000] dark:text-[#ff4444] bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">
              Super-role
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {dirty && !adminPermsLocked && (
            <button
              type="button"
              onClick={discard}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-800 flex items-center gap-1.5 transition-colors"
            >
              <Undo2 className="w-4 h-4" /> Discard
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || saveMut.isPending || adminPermsLocked}
            onClick={() => saveMut.mutate()}
            className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white font-medium hover:shadow-lg hover:shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-shadow"
          >
            {saveMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
          <button
            type="button"
            disabled={role.isSystem || role.memberCount > 0}
            onClick={onDeleteRequest}
            className="px-3 py-1.5 text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </header>

      <div className="p-8 space-y-3">
        {adminPermsLocked && (
          <div className="px-4 py-3 rounded-lg bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-300">
            The Admin role&apos;s permissions are managed by the seed script. Toggles are read-only.
          </div>
        )}
        {saveError && (
          <div className="px-4 py-3 rounded-lg bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {saveError}
          </div>
        )}

        {AREAS.map((area) => (
          <AreaSection
            key={area}
            area={area}
            perms={perms}
            disabled={adminPermsLocked}
            collapsed={collapsed.has(area)}
            onToggleCollapsed={() => toggleCollapsed(area)}
            onTogglePerm={togglePerm}
          />
        ))}
      </div>
    </section>
  );
}

function ColorSwatch({
  color,
  onChange,
  disabled,
}: {
  color: string;
  onChange: (c: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Change role color"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-5 h-5 rounded ring-2 ring-white dark:ring-neutral-900 shadow-sm flex-shrink-0 disabled:cursor-not-allowed"
        style={{ background: color }}
      />
      {open && !disabled && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute z-50 mt-2 left-0 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2 grid grid-cols-4 gap-1.5">
            {ROLE_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`w-6 h-6 rounded ring-2 ${
                  c === color
                    ? "ring-gray-900 dark:ring-gray-100"
                    : "ring-transparent"
                } hover:scale-110 transition-transform`}
                style={{ background: c }}
                aria-label={`Use ${c}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AreaSection({
  area,
  perms,
  disabled,
  collapsed,
  onToggleCollapsed,
  onTogglePerm,
}: {
  area: Area;
  perms: ReadonlySet<Permission>;
  disabled: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTogglePerm: (p: Permission) => void;
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
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {meta.label}
            </span>
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
                  onClick={() => onTogglePerm(perm)}
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
  onClick,
}: {
  label: string;
  description: string;
  on: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const labelColor = danger
    ? "text-red-700 dark:text-red-400"
    : "text-gray-900 dark:text-gray-100";

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
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

function CreateRoleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_NEW_ROLE_COLOR);
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color, permissions: [] }),
      });
      if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to create role");
      const data = (await r.json()) as { data: { id: string } };
      return data.data.id;
    },
    onSuccess: (id) => onCreated(id),
    onError: (e: unknown) => setError((e as Error).message),
  });

  return (
    <ModalShell title="New role" onClose={onClose}>
      <label className="block mb-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Name
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="mt-1 w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          placeholder="e.g. Customer Support"
        />
      </label>
      <div className="mb-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Color
        </span>
        <div className="mt-1 flex gap-1.5">
          {ROLE_COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded ring-2 ${
                c === color
                  ? "ring-gray-900 dark:ring-gray-100"
                  : "ring-transparent"
              } hover:scale-110 transition-transform`}
              style={{ background: c }}
              aria-label={`Use ${c}`}
            />
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Permissions start empty — toggle them on after creating the role.
      </p>
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-700 dark:text-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim() || mut.isPending}
          onClick={() => mut.mutate()}
          className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white font-medium hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Create role
        </button>
      </div>
    </ModalShell>
  );
}

function DeleteRoleModal({
  role,
  onClose,
  onDeleted,
}: {
  role: ApiRole;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to delete");
    },
    onSuccess: () => onDeleted(),
    onError: (e: unknown) => setError((e as Error).message),
  });

  return (
    <ModalShell title={`Delete role "${role.name}"?`} onClose={onClose}>
      {role.memberCount > 0 ? (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
          This role has {role.memberCount} member
          {role.memberCount === 1 ? "" : "s"}. Move them off the role before
          deleting.
        </p>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
          This will permanently delete the role. Staff who held it will need to
          be re-assigned.
        </p>
      )}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-700 dark:text-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={role.memberCount > 0 || mut.isPending}
          onClick={() => mut.mutate()}
          className="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <Trash2 className="w-4 h-4" /> Delete role
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm grid place-items-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
