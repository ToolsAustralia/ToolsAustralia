// src/components/tracking/ConversionPixelsAdvancedMatching.tsx
"use client";

import { useEffect, useRef } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { buildAdvancedMatching } from "@/lib/tracking/advanced-matching";
import { getAllowedHostnames } from "@/lib/tracking/hostname-gate";
import { normalizePhoneE164 } from "@/utils/tracking/tiktok-helpers";

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

    // Skip if we've already sent advanced matching for this user
    if (lastSentForUserIdRef.current === userData._id) return;

    // Hostname gate — same rule as the rest of the registry
    if (!getAllowedHostnames().includes(window.location.hostname)) return;

    // Each provider is independent: a missing/unloaded pixel for one MUST NOT block
    // the other. We only mark this user as "sent" once at least one pixel received
    // the identity, so we retry on the next render if the SDKs are still loading.
    let sentAny = false;

    // Facebook Advanced Matching — fbq.init is idempotent, so re-init updates AM in
    // place and every subsequent fbq('track', ...) automatically includes it.
    const fbPixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    if (fbPixelId && window.fbq) {
      window.fbq("init", fbPixelId, buildAdvancedMatching(userData) as Record<string, unknown>);
      sentAny = true;
    }

    // TikTok identity (advanced matching). The pixel SDK normalizes + SHA-256-hashes
    // the plaintext we pass before it leaves the browser; we pre-normalize phone to
    // E.164 and lower/trim email using the SAME helpers as the server-side Events API
    // sender so the SDK's hash matches the server hash (dedup-safe).
    const tiktokPixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
    if (tiktokPixelId && window.ttq) {
      const identify: Record<string, string> = {};
      if (userData.email) identify.email = userData.email.toLowerCase().trim();
      if (userData.mobile) {
        const phone = normalizePhoneE164(userData.mobile);
        if (phone) identify.phone_number = phone;
      }
      if (userData._id) identify.external_id = userData._id;
      if (Object.keys(identify).length > 0) {
        window.ttq.identify(identify);
        sentAny = true;
      }
    }

    if (sentAny) lastSentForUserIdRef.current = userData._id;
  }, [isAuthenticated, userData]);

  return null;
}
