"use client";

import { useReferralCode } from "@/hooks/useReferralCode";

/**
 * Site-wide referral tracking component
 * Initializes referral code tracking on every page load
 * Captures referral code from URL and stores in sessionStorage
 * Silent component with no UI - just tracking logic
 */
export default function ReferralTracker() {
  // Initialize referral link tracking - hook handles storage automatically
  // The useReferralCode hook automatically captures code from URL params
  // and stores it in sessionStorage, re-checking on route changes
  useReferralCode();

  // This component has no UI - it's purely for tracking
  return null;
}

