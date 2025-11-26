"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const REFERRAL_STORAGE_KEY = "tools-aus:referral-code";

const normalizeCode = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const trimmed = code.trim();
  return trimmed.length ? trimmed.toUpperCase() : null;
};

/**
 * Hook to track referral codes from URL parameters
 * Stores referral code in sessionStorage for use during registration and checkout
 * Works with Next.js App Router - automatically re-checks on route changes
 */
export const useReferralCode = () => {
  const [referralCode, setReferralCodeState] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check URL parameter (works with App Router)
    const urlCode = normalizeCode(searchParams.get("ref"));

    if (urlCode) {
      // Store in sessionStorage
      window.sessionStorage.setItem(REFERRAL_STORAGE_KEY, urlCode);
      setReferralCodeState(urlCode);
    } else {
      // Check sessionStorage for existing code
      const storedCode = normalizeCode(window.sessionStorage.getItem(REFERRAL_STORAGE_KEY));
      if (storedCode) {
        setReferralCodeState(storedCode);
      } else {
        // Clear state if no code found
        setReferralCodeState(null);
      }
    }
  }, [pathname, searchParams]); // Re-run on route changes

  const setReferralCode = useCallback((code: string | null) => {
    if (typeof window === "undefined") return;

    const normalized = normalizeCode(code);
    if (normalized) {
      window.sessionStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
      setReferralCodeState(normalized);
    } else {
      window.sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
      setReferralCodeState(null);
    }
  }, []);

  const clearReferralCode = useCallback(() => {
    setReferralCode(null);
  }, [setReferralCode]);

  return {
    referralCode,
    hasReferralCode: !!referralCode,
    setReferralCode,
    clearReferralCode,
  };
};
