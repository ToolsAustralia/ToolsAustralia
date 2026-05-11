// src/lib/tracking/registry.ts
import type { ConversionProvider, ProviderId } from "./types";
import { facebookProvider, tiktokProvider, snapchatProvider } from "./providers";

/**
 * The full provider list. Order is stable; dispatchers iterate this array.
 * Per-surface enablement is decided by each provider's `enabled()` call,
 * which reads env lazily so flipping a Vercel env var takes effect on
 * the next request without a redeploy.
 */
const ALL_PROVIDERS: readonly ConversionProvider[] = [
  facebookProvider,
  tiktokProvider,
  snapchatProvider,
];

export function getAllProviders(): readonly ConversionProvider[] {
  return ALL_PROVIDERS;
}

export function getProvider(id: ProviderId): ConversionProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}
