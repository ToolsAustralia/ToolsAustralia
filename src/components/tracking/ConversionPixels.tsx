// src/components/tracking/ConversionPixels.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getAllProviders } from "@/lib/tracking/registry";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { eventTimeNow } from "@/lib/tracking/canonical-event";

interface ConversionPixelsProps {
  /** CSP nonce from middleware (production). Passed to inline pixel scripts. */
  nonce?: string;
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
 * The initial PageView is fired inline by each provider's loadPixel script.
 */
export default function ConversionPixels({ nonce, disabled = false }: ConversionPixelsProps) {
  const ranRef = useRef(false);
  const pathname = usePathname();
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (disabled || ranRef.current) return;
    ranRef.current = true;
    for (const provider of getAllProviders()) {
      if (!provider.enabled().pixel) continue;
      provider.loadPixel({ nonce });
    }
  }, [nonce, disabled]);

  // Fire PageView on SPA route changes. Skip the very first call (initial mount) —
  // each provider's loadPixel script already fires a PageView on first load.
  useEffect(() => {
    if (disabled) return;
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (typeof window === "undefined") return;

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
