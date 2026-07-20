"use client";

import { useState, useEffect } from "react";

/**
 * Client-side hook to check affiliate authentication status
 * Reads the affiliate_token cookie to determine if affiliate is logged in
 */
export function useAffiliateAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [affiliateData, setAffiliateData] = useState<{
    affiliateId: string;
    email: string;
    username: string;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Perf gate: the real session cookie (`__Host-affiliate_token`) is httpOnly, so JS can't
    // read it. Affiliate login sets a non-httpOnly `affiliate_ui` marker (cleared on logout);
    // guests and regular users never carry it. Skip the check-auth network call unless the
    // marker is present — this is the common case (most visitors aren't affiliates). Keep the
    // cookie name in sync with the affiliate login/logout routes.
    const hasAffiliateMarker =
      typeof document !== "undefined" && document.cookie.includes("affiliate_ui=");
    if (!hasAffiliateMarker) {
      setIsAuthenticated(false);
      setAffiliateData(null);
      setLoading(false);
      return;
    }

    // Check affiliate authentication by calling an API endpoint
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/affiliate/check-auth");
        const data = await response.json();
        
        if (data.success && data.authenticated) {
          setIsAuthenticated(true);
          setAffiliateData(data.affiliate);
        } else {
          setIsAuthenticated(false);
          setAffiliateData(null);
        }
      } catch (error) {
        console.error("Error checking affiliate auth:", error);
        setIsAuthenticated(false);
        setAffiliateData(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  return {
    isAuthenticated,
    affiliateData,
    loading,
  };
}

