// src/lib/tracking/types.ts

export type ProviderId = "facebook" | "tiktok" | "snapchat";

/**
 * Canonical event shape passed to every provider. Provider-specific quirks
 * (FB's fbc/fbp, TikTok's ttclid, Snap's scid) live on userData but are
 * only read by the matching provider.
 */
export interface CanonicalEvent {
  /** e.g. 'Purchase' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'CompleteRegistration' | 'Subscribe' */
  eventName: string;
  /** Used for browser↔CAPI dedup. REQUIRED — `assertValidEvent` throws on empty. */
  eventId: string;
  /** Unix seconds. */
  eventTime: number;
  value?: number;
  /** ISO 4217, uppercase. */
  currency?: string;
  userData?: {
    /** Raw email — providers hash with their own rules. */
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    externalId?: string;
    birthdate?: string | Date;
    clientIpAddress?: string;
    clientUserAgent?: string;
    /** Facebook click id (cookie `_fbc`). Read by FB provider only. */
    fbc?: string;
    /** Facebook browser id (cookie `_fbp`). Read by FB provider only. */
    fbp?: string;
    /** TikTok click id. Read by TikTok provider only. */
    ttclid?: string;
    /** TikTok first-party browser id (cookie `_ttp`). Read by TikTok provider only. */
    ttp?: string;
    /** Snapchat click id. Read by Snapchat provider only. */
    scid?: string;
  };
  customData?: {
    contentIds?: string[];
    contentType?: string;
    contentName?: string;
    contentCategory?: string;
    numItems?: number;
    orderId?: string;
    packageType?: string;
    searchString?: string;
  };
  eventSourceUrl?: string;
  /**
   * Maps to Meta's `action_source` (and the equivalent on other providers).
   * - "website" (default): browser-originated event with a live session.
   * - "system_generated": server-initiated event with no live session (e.g. Stripe webhook).
   * Per Meta's spec, `event_source_url` is required for "website" but optional for
   * "system_generated" — providers should omit URL fabrication in the latter case.
   */
  actionSource?: "website" | "system_generated";
  /** Escape hatch for provider-specific custom fields. Use sparingly. */
  providerData?: {
    facebook?: Record<string, unknown>;
    tiktok?: Record<string, unknown>;
    snapchat?: Record<string, unknown>;
  };
}

export interface RequestContext {
  clientIpAddress?: string;
  clientUserAgent?: string;
  eventSourceUrl?: string;
}

export interface ConversionProvider {
  id: ProviderId;
  /**
   * Per-surface enablement. Pixel id and access token are independent —
   * a provider can have the pixel live while CAPI is still onboarding.
   * Env reads are lazy on every call so flipping env vars takes effect on next request.
   */
  enabled(): { pixel: boolean; capi: boolean };
  /** Hostnames that may run the browser pixel. Pixel refuses on any other host. */
  productionHostnames(): string[];
  /**
   * Bootstrap the provider's pixel imperatively (queue stub + src-script SDK —
   * never inline script text; see docs/tracking/gotchas.md). Idempotent.
   * No-op if `enabled().pixel` is false.
   */
  loadPixel(opts?: { advancedMatching?: Record<string, string> }): void;
  /** Fire the event in the browser. No-op if `enabled().pixel` is false or hostname is non-prod. */
  pixelTrack(event: CanonicalEvent): void;
  /** Send the event server-to-server. MUST return false (no network call) if `enabled().capi` is false. MUST return false on validation failure (never throw). */
  capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean>;
}
