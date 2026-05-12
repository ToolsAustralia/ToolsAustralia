// src/lib/tracking/dispatch.ts
import type { CanonicalEvent, ConversionProvider, ProviderId, RequestContext } from "./types";
import { getAllProviders } from "./registry";
import { assertValidEvent } from "./canonical-event";

export type DispatchResults = Record<ProviderId, boolean>;

/**
 * Fan out a CanonicalEvent to every provider's CAPI side that is enabled.
 * Never throws. Returns a per-provider success map.
 *
 * Hard contract (spec §3):
 * - eventId must be non-empty (validated here, not in providers)
 * - disabled providers skip the network call entirely (no fetch, no warn-spam)
 * - one provider failing does NOT stop others
 */
export async function sendConversion(
  event: CanonicalEvent,
  ctx: RequestContext,
): Promise<DispatchResults> {
  return sendConversionWithProviders(event, ctx, getAllProviders());
}

/** Internal — exported for tests so we can inject fakes without touching the registry. */
export async function sendConversionWithProviders(
  event: CanonicalEvent,
  ctx: RequestContext,
  providers: readonly ConversionProvider[],
): Promise<DispatchResults> {
  const results: DispatchResults = { facebook: false, tiktok: false, snapchat: false };

  if (!assertValidEvent(event)) {
    return results;
  }

  await Promise.all(
    providers.map(async (provider) => {
      const en = provider.enabled();
      if (!en.capi) {
        results[provider.id] = false;
        return;
      }
      try {
        results[provider.id] = await provider.capiSend(event, ctx);
      } catch (err) {
        console.error("[tracking] capiSend threw — provider must not throw", {
          provider: provider.id,
          event_name: event.eventName,
          event_id: event.eventId,
          err: err instanceof Error ? err.message : String(err),
        });
        results[provider.id] = false;
      }
    }),
  );

  return results;
}
