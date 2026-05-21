// src/lib/internal-norm/killSwitch.ts
import NormEndpointSettings from "@/models/NormEndpointSettings";
import connectDB from "@/lib/mongodb";

const CACHE_TTL_MS = 30_000;
type CacheEntry = { disabled: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function envDisabledSet(): Set<string> {
  const raw = process.env.NORM_DISABLED_REGISTRY_KEYS || "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export async function isEndpointDisabled(registryKey: string): Promise<boolean> {
  if (envDisabledSet().has(registryKey)) return true;
  const cached = cache.get(registryKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.disabled;
  await connectDB();
  const row = await NormEndpointSettings.findOne({ registryKey }).lean<{ disabled?: boolean } | null>();
  const disabled = !!row?.disabled;
  cache.set(registryKey, { disabled, expiresAt: now + CACHE_TTL_MS });
  return disabled;
}

export function __clearKillSwitchCacheForTests() {
  cache.clear();
}
