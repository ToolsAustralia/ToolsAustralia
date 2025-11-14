import { useMemo, useCallback } from "react";
import {
  getSubscriptionPackages as getStaticSubscriptionPackages,
  getOneTimePackages as getStaticOneTimePackages,
} from "@/data/membershipPackages";

// Legacy interface for backward compatibility
export interface MembershipPackage {
  _id: string;
  name: string;
  type: "subscription" | "one-time";
  price: number;
  description: string;
  features: string[];
  entriesPerMonth?: number;
  totalEntries?: number;
  shopDiscountPercent?: number;
  partnerDiscountDays?: number;
  isMemberOnly?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface MembershipPlan {
  _id: string;
  id: string; // For backward compatibility
  name: string;
  subtitle?: string;
  price: number;
  period: string;
  features: string[];
  isPopular?: boolean;
  buttonText: string;
  buttonStyle: "primary" | "secondary";
  entriesPerMonth?: number;
  totalEntries?: number;
  shopDiscountPercent?: number;
  isMemberOnly?: boolean;
}

export function useMemberships() {
  // Helper functions for package conversion
  const getSubtitle = useCallback((name: string): string => {
    const subtitles: Record<string, string> = {
      Starter: "Tradie",
      Pro: "Powerpass / Builder",
      VIP: "Hard Yakka / Legends",
    };
    return subtitles[name] || "";
  }, []);

  const getButtonText = useCallback((name: string): string => {
    const buttonTexts: Record<string, string> = {
      Tradie: "Get Started",
      Foreman: "Go Pro",
      Boss: "Become Boss",
      "Apprentice Pack": "Get Pack",
      "Tradie Pack": "Get Tradie",
      "Foreman Pack": "Get Foreman",
      "Boss Pack": "Get Boss",
      "Power Pack": "Get Power",
    };
    return buttonTexts[name] || "Select";
  }, []);

  // Convert API package to frontend plan format
  const convertPackageToPlan = useCallback(
    (pkg: MembershipPackage): MembershipPlan => {
      // Add safety checks to prevent undefined values
      if (!pkg || !pkg.features || !Array.isArray(pkg.features)) {
        console.warn("Invalid package data:", pkg);
        return {
          _id: pkg?._id || "unknown",
          id: "unknown",
          name: pkg?.name || "Unknown Package",
          subtitle: "",
          price: pkg?.price || 0,
          period: "mo",
          features: [],
          isPopular: false,
          buttonText: "Select",
          buttonStyle: "secondary",
          entriesPerMonth: 0,
          totalEntries: 0,
          shopDiscountPercent: 0,
          isMemberOnly: false,
        };
      }

      // Process features array safely
      const features = Array.isArray(pkg.features) ? pkg.features : [];

      // Generate unique ID that includes member-only status to avoid conflicts
      const baseId = pkg.name.toLowerCase().replace(/\s+/g, "-");
      const uniqueId = pkg.isMemberOnly ? `${baseId}-member` : baseId;

      return {
        _id: pkg._id,
        id: uniqueId, // For backward compatibility with unique member distinction
        name: pkg.name,
        subtitle: getSubtitle(pkg.name),
        price: pkg.price,
        period: pkg.type === "subscription" ? "mo" : "one-time",
        features,
        isPopular: pkg.name === "Foreman", // Mark Foreman as popular
        buttonText: getButtonText(pkg.name),
        buttonStyle: pkg.name === "Foreman" ? "primary" : "secondary",
        entriesPerMonth: pkg.entriesPerMonth,
        totalEntries: pkg.totalEntries,
        shopDiscountPercent: pkg.shopDiscountPercent,
        isMemberOnly: pkg.isMemberOnly,
      };
    },
    [getSubtitle, getButtonText]
  );

  // Use useMemo to compute membership data synchronously from static data
  const { subscriptionPackages, oneTimePackages } = useMemo(() => {
    try {
      // Get static data synchronously
      const staticSubscriptions = getStaticSubscriptionPackages();
      const staticOneTime = getStaticOneTimePackages();

      // Convert to frontend format
      const subscriptions = staticSubscriptions.map(convertPackageToPlan);
      const oneTime = staticOneTime.map(convertPackageToPlan);

      return {
        subscriptionPackages: subscriptions,
        oneTimePackages: oneTime,
      };
    } catch (err) {
      console.error("Error processing memberships:", err);
      return {
        subscriptionPackages: [],
        oneTimePackages: [],
      };
    }
  }, [convertPackageToPlan]);

  return {
    subscriptionPackages,
    oneTimePackages,
    loading: false, // No loading state needed for static data
    error: null, // No error state needed for static data
    refetch: () => {}, // No refetch needed for static data
  };
}
