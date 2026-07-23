/**
 * Staff/admin (privileged) account detection.
 *
 * A privileged account must NEVER be created or mutated through the public
 * registration path (`/api/auth/register`). Staff accounts are provisioned with
 * `accumulatedEntries === 0` and no saved payment methods, so the registration
 * route's "plain account" heuristic (entries === 0) would otherwise treat them as
 * safe to overwrite — letting an unauthenticated request rebind a privileged
 * account's name/mobile, and (on a mobile match) move its login email onto an
 * attacker-controlled address while keeping the admin role. This guard closes that.
 *
 * The authoritative staff markers are the RBAC fields `roleId` / `userType`, NOT
 * the legacy `role` string: Manager and Customer Support staff carry
 * `role: "user"` with a non-null `roleId` and `userType: "staff"` — only the
 * legacy super-admin has `role: "admin"`. Any one of these signals ⇒ privileged.
 *
 * See docs/auth/roles.md and docs/auth/gotchas.md.
 */
type PrivilegedAccountFields = {
  roleId?: unknown | null;
  userType?: string | null;
  role?: string | null;
};

export function isPrivilegedAccount(user: PrivilegedAccountFields | null | undefined): boolean {
  if (!user) return false;
  if (user.roleId) return true; // has an assigned RBAC role — definitive staff marker
  if (user.userType && user.userType !== "customer") return true; // "staff" | "admin"
  if (user.role && user.role !== "user") return true; // legacy admin flag
  return false;
}
