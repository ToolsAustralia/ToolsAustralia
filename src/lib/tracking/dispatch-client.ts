// src/lib/tracking/dispatch-client.ts
import type { CanonicalEvent, ConversionProvider } from "./types";
import { getAllProviders } from "./registry";
import { assertValidEvent } from "./canonical-event";

/**
 * Fire a CanonicalEvent into every provider's browser pixel.
 * Synchronous fire-and-forget. Per-provider production-hostname gate is enforced inside
 * each provider's pixelTrack, but we also short-circuit here for non-browser execution.
 */
export function trackConversion(event: CanonicalEvent): void {
  trackConversionWithProviders(event, getAllProviders());
}

/** Internal — exported for tests. */
export function trackConversionWithProviders(
  event: CanonicalEvent,
  providers: readonly ConversionProvider[],
): void {
  if (typeof window === "undefined") return;
  if (!assertValidEvent(event)) return;

  for (const provider of providers) {
    const en = provider.enabled();
    if (!en.pixel) continue;
    const allowed = provider.productionHostnames();
    if (allowed.length > 0 && !allowed.includes(window.location.hostname)) {
      // Production-hostname gate — refuse on non-prod hosts (spec §3 invariant #2).
      continue;
    }
    try {
      provider.pixelTrack(event);
    } catch (err) {
      console.error("[tracking] pixelTrack threw — provider must not throw", {
        provider: provider.id,
        event_name: event.eventName,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
