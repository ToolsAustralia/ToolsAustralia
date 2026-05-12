// src/components/tracking/ConversionPixelsAdvancedMatching.tsx
"use client";

import { useEffect, useRef } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { buildAdvancedMatching } from "@/lib/tracking/advanced-matching";
import { getAllowedHostnames } from "@/lib/tracking/hostname-gate";

/**
 * Post-login Advanced Matching re-init for the Facebook Pixel.
 *
 * The top-level <ConversionPixels /> mounts above <UserProvider> in the tree
 * (so it can render before next-auth resolves a session), which means it can't
 * see the authenticated user. This component mounts INSIDE UserProvider,
 * watches for user data to land, and re-initializes the FB Pixel with
 * Advanced Matching so subsequent events match users on hashed PII rather
 * than cookies alone.
 *
 * fbq.init is idempotent — calling it again with new AM fields updates AM
 * in place without re-loading the SDK.
 *
 * Why it matters: cookie-based matching (_fbp/_fbc) fails under ITP (Safari),
 * Enhanced Tracking Protection (Firefox), Brave, every ad-blocker, and every
 * device switch. AM matches against Meta's user graph via hashed PII, which
 * survives all of those.
 *
 * Reference: https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching
 */
export default function ConversionPixelsAdvancedMatching() {
  const { userData, isAuthenticated } = useUserContext();
  // Track the last user we sent AM for so we don't re-init on every render.
  // Re-init only when the user identity actually changes.
  const lastSentForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated || !userData?._id) return;

    // Skip if we've already sent AM for this user
    if (lastSentForUserIdRef.current === userData._id) return;

    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    if (!pixelId) return;

    // Hostname gate — same rule as the rest of the registry
    if (!getAllowedHostnames().includes(window.location.hostname)) return;

    // fbq must already be loaded (top-level ConversionPixels injected the SDK).
    // If the SDK is still loading, the call queues; once loaded it'll be replayed.
    if (!window.fbq) return;

    const am = buildAdvancedMatching(userData);

    // Re-init with AM. fbq.init is idempotent — this updates AM in place
    // and every subsequent fbq('track', ...) call automatically includes it.
    window.fbq("init", pixelId, am as Record<string, unknown>);
    lastSentForUserIdRef.current = userData._id;
  }, [isAuthenticated, userData]);

  return null;
}
