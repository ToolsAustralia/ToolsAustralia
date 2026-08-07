"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUserContext } from "@/contexts/UserContext";
import { shouldTrackRoute } from "@/utils/tracking/should-track-route";

/**
 * Contentsquare dynamic variables — membership segmentation.
 *
 * WHY THIS EXISTS
 * Contentsquare's analysis features (zoning, Journey Analysis, Page Comparator, funnels)
 * are only worth the licence if you can ask "does a Boss member behave differently from a
 * guest on /membership?". That requires member attributes on the session, which the tag
 * cannot know by itself. `trackDynamicVariable` is the documented way to attach them:
 *   window._uxa.push(["trackDynamicVariable", { key, value }])
 * Values are string (<=255 chars) or integer; numeric values unlock >/< operators in
 * segmentation, strings get auto-complete and regex. Max 40 distinct keys per pageview.
 *
 * WHY IT IS NOT IN ContentsquarePageTracker
 * That component is mounted in src/app/layout.tsx OUTSIDE <Providers>, so it has no access
 * to the session or the React Query cache — calling a membership hook there throws. This one
 * is mounted INSIDE <Providers>, next to <KlaviyoUserIdentifier />, which is the established
 * home for "tracking that needs to know who the user is".
 *
 * WHY IT RE-SENDS ON EVERY ROUTE CHANGE
 * Dynamic variables are scoped to the CURRENT pageview, not the session. Every SPA navigation
 * starts a fresh pageview (see ContentsquarePageTracker), which carries no variables unless we
 * push them again — so `pathname` is a real dependency, not defensive noise. Re-pushing an
 * unchanged value is harmless: Contentsquare keeps only the last value per key per pageview.
 *
 * WHAT IS DELIBERATELY NOT SENT
 * No PII. Tier and status are plan metadata, not personal information; name/email/entry
 * history never go through here. `identify` and `addUserProperties` are also avoided — both
 * require the Product Analytics (heap) configuration this account does not have, so they
 * would silently no-op.
 *
 * Gated at the mount site on NEXT_PUBLIC_CONTENTSQUARE_ID (rules.md R8), exactly like
 * <ContentsquarePageTracker /> in the root layout — blank id ⇒ never mounted, so dev/e2e
 * send nothing. `window._uxa` is typed by the `declare global` block in
 * ContentsquarePageTracker.tsx.
 */

/** Contentsquare's cap for a dynamic-variable value. */
const MAX_VALUE_LENGTH = 255;

type DynamicVariables = Record<string, string | number>;

function pushDynamicVariables(variables: DynamicVariables) {
  window._uxa = window._uxa || [];
  for (const [key, value] of Object.entries(variables)) {
    window._uxa.push([
      "trackDynamicVariable",
      { key, value: typeof value === "string" ? value.slice(0, MAX_VALUE_LENGTH) : value },
    ]);
  }
}

export default function ContentsquareDynamicVariables() {
  const pathname = usePathname();
  const { loading, isAuthenticated, isMember, membershipStatus } = useUserContext();
  // Last payload actually sent, keyed by pathname, so a re-render with identical values
  // is a no-op but a genuine navigation always re-sends.
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Membership state arrives async (TanStack Query). Pushing mid-flight would send
    // "guest" for a signed-in member and then correct it — last-value-wins makes that
    // survivable, but waiting avoids polluting the guest segment with real members.
    if (loading) return;

    // Internal/staff routes are excluded from Contentsquare reporting; don't attach
    // member attributes to them either.
    if (!shouldTrackRoute(pathname)) return;

    // `membershipStatus` is the useUserMembership() result, typed `unknown` on the context.
    // Narrow it the same way UserContext itself does rather than casting blindly.
    const membership =
      membershipStatus && typeof membershipStatus === "object"
        ? (membershipStatus as {
            membershipTier?: string;
            hasActiveOneTimePackages?: boolean;
          })
        : null;

    const variables: DynamicVariables = {
      is_member: isMember ? "yes" : "no",
      is_authenticated: isAuthenticated ? "yes" : "no",
      // "None" for guests and for signed-in non-members — matches useUserMembership's own default.
      membership_tier: membership?.membershipTier || "None",
      has_one_time_pack: membership?.hasActiveOneTimePackages ? "yes" : "no",
    };

    const signature = `${pathname}|${JSON.stringify(variables)}`;
    if (lastSentRef.current === signature) return;
    lastSentRef.current = signature;

    pushDynamicVariables(variables);
  }, [pathname, loading, isAuthenticated, isMember, membershipStatus]);

  return null;
}
