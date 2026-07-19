// src/components/tracking/ConversionPixels.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getAllProviders } from "@/lib/tracking/registry";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
import { shouldTrackRoute } from "@/utils/tracking/should-track-route";
import { captureClickIds } from "@/utils/tracking/click-capture";

interface ConversionPixelsProps {
  /** Set true in dev/preview to force-disable every pixel even if env is set. */
  disabled?: boolean;
}

/**
 * Mounts every enabled provider's browser pixel. Replaces the legacy <PixelTracker />.
 *
 * Each provider's `loadPixel` is responsible for:
 * - Idempotency (won't re-inject if already loaded)
 * - Production-hostname gating (won't load on staging/dev)
 * - Missing-credentials safety (no-op if `enabled().pixel` is false)
 *
 * Also fires a PageView on every SPA route change so per-navigation impressions
 * keep flowing into Meta/TikTok/Snap even when the user never reloads the page.
 * The initial PageView is fired imperatively by each provider's loadPixel
 * bootstrap (no inline script text, no CSP nonce needed — see
 * docs/tracking/gotchas.md).
 */
export default function ConversionPixels({ disabled = false }: ConversionPixelsProps) {
  const ranRef = useRef(false);
  const pathname = usePathname();
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (disabled || ranRef.current) return;
    ranRef.current = true;
    // Persist all platform click ids from the landing URL so they survive to conversion
    // and are readable server-side for the Events API. No-op when no params present.
    captureClickIds();
    for (const provider of getAllProviders()) {
      if (!provider.enabled().pixel) continue;
      provider.loadPixel();
    }
  }, [disabled]);

  // Fire PageView on SPA route changes. Skip the very first call (initial mount) —
  // each provider's loadPixel bootstrap already fires a PageView on first load
  // (also gated by shouldTrackRoute inside loadPixel).
  // Also skipped on internal/staff routes (admin / my-account / affiliate / etc.)
  // so admins navigating around the dashboard don't pollute remarketing audiences,
  // drag Event Match Quality down with low-signal sessions, or inflate PageView counts.
  // Note: Meta's pushState auto-PageView is separately disabled in providers/facebook.ts
  // via `fbq.disablePushState = true` — without that, Meta's own pixel bypasses
  // this gate via its internal HTML5 History State listener.
  useEffect(() => {
    if (disabled) return;
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    if (!shouldTrackRoute(pathname)) return;

    trackConversion({
      eventName: "PageView",
      // Synthetic eventId — PageView has no CAPI counterpart to dedupe against.
      eventId: `pageview-${pathname}-${Date.now()}`,
      eventTime: eventTimeNow(),
      eventSourceUrl: window.location.href,
    });
  }, [pathname, disabled]);

  return null;
}
