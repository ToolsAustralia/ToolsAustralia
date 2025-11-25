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

