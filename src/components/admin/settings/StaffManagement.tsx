"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  Crown,
  Loader2,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEmailVerified: boolean;
  userType: "staff" | "admin";
  roleId: string | null;
  roleName: string | null;
  roleColor: string | null;
  inviteStatus: "active" | "pending" | "expired";
  invitedAt: string | null;
}

interface RoleSummary {
  id: string;
  name: string;
  color: string | null;
}

interface StaffResponse {
  success: true;
  data: StaffUser[];
}

interface RolesResponse {
  success: true;
  data: {
    roles: { id: string; name: string; color: string | null }[];
  };
}

async function fetchStaff(): Promise<StaffResponse> {
  const r = await fetch("/api/admin/staff");
  if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to load staff");
  return r.json();
}

async function fetchRolesSummary(): Promise<RolesResponse> {
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

export default function StaffManagement() {
  const qc = useQueryClient();
  const { data: staffResp, isLoading: staffLoading, error: staffError } =
    useQuery<StaffResponse>({
      queryKey: ["admin", "staff"],
      queryFn: fetchStaff,
    });
  const { data: rolesResp, isLoading: rolesLoading } = useQuery<RolesResponse>({
    queryKey: ["admin", "roles"],
    queryFn: fetchRolesSummary,
  });

  const perms = usePermissions();
  const canInviteStaff = perms.has("settings.edit");
  const canRemoveStaff = perms.has("settings.delete");

  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<StaffUser | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const staff = staffResp?.data ?? [];
  const roles: RoleSummary[] = useMemo(
    () => rolesResp?.data.roles ?? [],
    [rolesResp]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        (s.roleName ?? "").toLowerCase().includes(q)
    );
  }, [staff, search]);

  if (staffLoading || rolesLoading) {
    return (
      <div className="p-10 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading staff…
      </div>
    );
  }
  if (staffError) {
    return (
      <div className="p-10 text-red-600 dark:text-red-400">
        {(staffError as Error).message}
      </div>
    );
  }

  function handleRowError(id: string, message: string | null) {
    setRowError((prev) => {
      if (!message) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: message };
    });
  }

  return (
    <div className="bg-gray-50 dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name, email, or role…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          />
        </div>
        {canInviteStaff && (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white font-medium hover:shadow-lg hover:shadow-red-500/20 transition-shadow flex-shrink-0"
          >
            <Plus className="w-4 h-4" /> Invite staff
          </button>
        )}
      </header>

      {filtered.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900">
          {search ? "No staff match that search." : "No staff yet."}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-neutral-900">
          {filtered.map((s) => (
            <StaffRow
              key={s.id}
              staff={s}
              roles={roles}
              error={rowError[s.id] ?? null}
              onRowError={handleRowError}
              onRemoveRequest={
                canRemoveStaff ? () => setRemoving(s) : undefined
              }
              onMutated={() => qc.invalidateQueries({ queryKey: ["admin", "staff"] })}
            />
          ))}
        </ul>
      )}

      {inviting && (
        <InviteModal
          roles={roles}
          onClose={() => setInviting(false)}
          onSent={() => {
            setInviting(false);
            qc.invalidateQueries({ queryKey: ["admin", "staff"] });
          }}
        />
      )}

      {removing && (
        <RemoveStaffModal
          staff={removing}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null);
            qc.invalidateQueries({ queryKey: ["admin", "staff"] });
          }}
        />
      )}
    </div>
  );
}

function StaffRow({
  staff,
  roles,
  error,
  onRowError,
  onRemoveRequest,
  onMutated,
}: {
  staff: StaffUser;
  roles: RoleSummary[];
  error: string | null;
  onRowError: (id: string, message: string | null) => void;
  /** Undefined hides the Remove button (caller gates by settings.delete). */
  onRemoveRequest?: () => void;
  onMutated: () => void;
}) {
  const { data: session } = useSession();
  const isSelf = session?.user?.id === staff.id;
  const avatarColor = staff.roleColor ?? "#9ca3af";

  const changeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const r = await fetch(`/api/admin/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!r.ok)
        throw new Error((await safeError(r)) ?? "Failed to change role");
    },
    onSuccess: () => {
      onRowError(staff.id, null);
      onMutated();
    },
    onError: (e: unknown) => onRowError(staff.id, (e as Error).message),
  });

  const resend = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resendInvite: true }),
      });
      if (!r.ok)
        throw new Error((await safeError(r)) ?? "Failed to resend invite");
    },
    onSuccess: () => {
      onRowError(staff.id, null);
      onMutated();
    },
    onError: (e: unknown) => onRowError(staff.id, (e as Error).message),
  });

  return (
    <li className="px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:bg-gray-50 dark:hover:bg-neutral-800/40 -mx-2 px-2 py-1 rounded-lg transition-colors">
        {/* Top row on mobile: avatar + identity + status. Inline on sm+. */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ring-2 ring-white dark:ring-neutral-900 shadow-sm"
            style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)` }}
            aria-hidden
          >
            {staff.firstName[0]?.toUpperCase()}
            {staff.lastName[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <span className="truncate">
                {staff.firstName} {staff.lastName}
              </span>
              {staff.userType === "admin" && (
                <Crown
                  className="w-3.5 h-3.5 text-[#ee0000] dark:text-[#ff4444] flex-shrink-0"
                  aria-label="Super-admin"
                />
              )}
              {isSelf && (
                <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded flex-shrink-0">
                  You
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {staff.email}
            </div>
          </div>
          {/* Status badge sits next to identity on mobile so the bottom row is just controls */}
          <div className="sm:hidden flex-shrink-0">
            <StatusBadge status={staff.inviteStatus} />
          </div>
        </div>

        {/* Bottom row on mobile (controls). Inline on sm+. */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <select
          value={staff.roleId ?? ""}
          disabled={changeRole.isPending}
          onChange={(e) => changeRole.mutate(e.target.value)}
          className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40 disabled:opacity-50"
        >
          {staff.roleId === null && <option value="">No role</option>}
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <div className="hidden sm:block">
          <StatusBadge status={staff.inviteStatus} />
        </div>

        <div className="flex gap-1">
          {staff.inviteStatus !== "active" && (
            <button
              type="button"
              title="Resend invite"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300 disabled:opacity-50 transition-colors"
            >
              {resend.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          )}
          {onRemoveRequest && (
            <button
              type="button"
              title={isSelf ? "Can't remove yourself" : "Remove staff member"}
              disabled={isSelf}
              onClick={onRemoveRequest}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        </div>
      </div>

      {error && (
        <div className="mt-2 sm:ml-14 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: "active" | "pending" | "expired" }) {
  const styles = {
    active: "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400",
    pending:
      "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-400",
    expired: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400",
  } as const;
  const label =
    status === "active" ? "Active" : status === "pending" ? "Invited" : "Expired";
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${styles[status]}`}
    >
      {label}
    </span>
  );
}

function InviteModal({
  roles,
  onClose,
  onSent,
}: {
  roles: RoleSummary[];
  onClose: () => void;
  onSent: () => void;
}) {
  // Default to the first non-Admin role if one exists; otherwise the first
  // available role. Falling back to no role defeats the schema requirement.
  const defaultRole =
    roles.find((r) => r.name !== "Admin")?.id ?? roles[0]?.id ?? "";
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState(defaultRole);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, firstName, lastName, roleId }),
      });
      if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to send invite");
    },
    onSuccess: () => onSent(),
    onError: (e: unknown) => setError((e as Error).message),
  });

  const canSubmit =
    email.trim() && firstName.trim() && lastName.trim() && roleId && !mut.isPending;

  return (
    <ModalShell title="Invite staff" onClose={onClose}>
      <label className="block mb-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </span>
        <input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="mt-1 w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
        />
      </label>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            First name
          </span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Last name
          </span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          />
        </label>
      </div>
      <label className="block mb-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Role
        </span>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="mt-1 w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Inviting into the Admin role creates a super-admin (no permission
          restrictions and full access to customer routes).
        </p>
      </label>

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
          disabled={!canSubmit}
          onClick={() => mut.mutate()}
          className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white font-medium hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Send invite
        </button>
      </div>
    </ModalShell>
  );
}

function RemoveStaffModal({
  staff,
  onClose,
  onRemoved,
}: {
  staff: StaffUser;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/staff/${staff.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await safeError(r)) ?? "Failed to remove");
    },
    onSuccess: () => onRemoved(),
    onError: (e: unknown) => setError((e as Error).message),
  });

  return (
    <ModalShell
      title={`Remove ${staff.firstName} ${staff.lastName}?`}
      onClose={onClose}
    >
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
        This deactivates their admin access and converts their account back to a
        regular customer.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        The underlying user document is preserved so audit history (payments,
        notes, etc.) stays intact. You can re-invite them later under any role.
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
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
          className="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <Trash2 className="w-4 h-4" /> Remove
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
