// src/lib/internal-norm/permissions.ts
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import type { Permission } from "@/lib/permissions";

const NORM_EMAIL = "norm@internal.toolsaustralia.com.au";
const CACHE_TTL_MS = 30_000;

let cache: { perms: Set<string>; expiresAt: number } | null = null;

export async function getNormPermissions(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.perms;
  await connectDB();
  const user = await User.findOne({ email: NORM_EMAIL }).select("roleId userType").lean();
  if (!user) {
    cache = { perms: new Set(), expiresAt: now + CACHE_TTL_MS };
    return cache.perms;
  }
  // Defense: Norm must be userType="staff". If something flipped it to "admin" (super-admin bypass),
  // that's a configuration error — we still return only what the Role explicitly grants.
  if (!user.roleId) {
    cache = { perms: new Set(), expiresAt: now + CACHE_TTL_MS };
    return cache.perms;
  }
  const role = await Role.findById(user.roleId).select("permissions").lean();
  const perms = new Set<string>(role?.permissions ?? []);
  cache = { perms, expiresAt: now + CACHE_TTL_MS };
  return perms;
}

export async function hasNormPermission(perm: Permission | string): Promise<boolean> {
  const set = await getNormPermissions();
  return set.has(perm);
}

export function __clearNormPermissionsCacheForTests() {
  cache = null;
}
