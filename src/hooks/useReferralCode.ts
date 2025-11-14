import { useCallback, useEffect, useState } from "react";

const REFERRAL_STORAGE_KEY = "tools-aus:referral-code";

const normalizeCode = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const trimmed = code.trim();
  return trimmed.length ? trimmed.toUpperCase() : null;
};

export const useReferralCode = () => {
  const [referralCode, setReferralCodeState] = useState<string | null>(null);

  // Initialize from query string or sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const urlCode = normalizeCode(params.get("ref"));
    const storedCode = normalizeCode(window.sessionStorage.getItem(REFERRAL_STORAGE_KEY));

    if (urlCode) {
      window.sessionStorage.setItem(REFERRAL_STORAGE_KEY, urlCode);
      setReferralCodeState(urlCode);
      return;
    }

    if (storedCode) {
      setReferralCodeState(storedCode);
    }
  }, []);

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
