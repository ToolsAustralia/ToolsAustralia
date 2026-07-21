"use client";

import { Suspense } from "react";
import { useReferralCode } from "@/hooks/useReferralCode";

/**
 * Site-wide referral tracking component
 * Initializes referral code tracking on every page load
 * Captures referral code from URL and stores in sessionStorage
 * Silent component with no UI - just tracking logic
 */
function ReferralTrackerInner() {
  // Initialize referral link tracking - hook handles storage automatically
  // The useReferralCode hook automatically captures code from URL params
  // and stores it in sessionStorage, re-checking on route changes
  useReferralCode();

  // This component has no UI - it's purely for tracking
  return null;
}

// Suspense self-wrap: useSearchParams requires a boundary for prerendered (marketing-class) pages — docs/security-csp/rules.md R8.
// Mounted site-wide (providers.tsx) so every route's render tree passes through here.
export default function ReferralTracker() {
  return (
    <Suspense fallback={null}>
      <ReferralTrackerInner />
    </Suspense>
  );
}


