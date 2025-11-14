"use client";

import { useEffect, useCallback, useRef } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { hasRecentPurchase } from "@/utils/tracking/purchase-tracking";

interface UseMiniDrawTriggerProps {
  /**
   * Delay in milliseconds before showing the special packages modal
   * Default: 3000ms (3 seconds)
   */
  delay?: number;
  /**
   * Whether to show the modal only once per session
   * Default: true (recommended for better UX)
   */
  showOncePerSession?: boolean;
  /**
   * Whether the trigger is enabled
   * Default: true
   */
  enabled?: boolean;
}

/**
 * Hook to manage special packages modal triggers
 * Shows special packages modal for authenticated members with active subscriptions after a delay
 * Uses sessionStorage to track if modal has been shown in current session
 */
export const useMiniDrawTrigger = ({
  delay = 3000,
  showOncePerSession = true,
  enabled = true,
}: UseMiniDrawTriggerProps = {}) => {
  const { isAuthenticated, hasActiveSubscription, userData } = useUserContext();
  const { requestModal, isModalActive } = useModalPriorityStore();

  // Track if modal has been shown in this session using sessionStorage
  const SESSION_STORAGE_KEY = "specialPackagesModalShown";
  const triggerAttemptedRef = useRef(false);

  /**
   * Check if modal has been shown in this session
   */
  const hasModalBeenShown = useCallback(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
  }, []);

  /**
   * Mark modal as shown in this session
   */
  const markModalAsShown = useCallback(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
  }, []);

  /**
   * Clear session storage (for manual triggers or testing)
   */
  const clearSessionFlag = useCallback(() => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  /**
   * Check if user just completed a purchase (should delay mini draw)
   */
  const checkRecentPurchase = useCallback(() => {
    const isRecent = hasRecentPurchase();

    if (isRecent) {
      console.log("🔍 Recent purchase detected - delaying mini draw");
    }

    return isRecent;
  }, []);

  /**
   * Check if user is eligible for special packages modal
   * CRITICAL: Only users with active subscriptions are eligible
   */
  const isEligibleForMiniDraw = useCallback(() => {
    console.log("🔍 Special packages eligibility check:", {
      isAuthenticated,
      hasActiveSubscription,
      userData: userData ? "exists" : "null",
    });

    // Must be authenticated
    if (!isAuthenticated) {
      console.log("🚫 Special packages trigger: User not authenticated");
      return false;
    }

    // Check if user just completed a purchase - delay special packages
    if (checkRecentPurchase()) {
      console.log("🚫 Special packages trigger: User just completed a purchase, delaying special packages");
      return false;
    }

    // CRITICAL: Must have active subscription (not just one-time packages)
    if (!hasActiveSubscription) {
      console.log("🚫 Special packages trigger: User does not have active subscription");
      return false;
    }

    console.log("✅ Special packages trigger: User is eligible");
    return true;
  }, [isAuthenticated, hasActiveSubscription, userData, checkRecentPurchase]);

  /**
   * Trigger special packages modal
   */
  const triggerMiniDrawModal = useCallback(() => {
    console.log("🎯 Special packages trigger called with:", {
      enabled,
      isModalActive: isModalActive("special-packages"),
      delay,
      showOncePerSession,
      hasModalBeenShown: hasModalBeenShown(),
      triggerAttempted: triggerAttemptedRef.current,
    });

    if (!enabled) {
      console.log("🚫 Mini draw trigger: Disabled");
      return;
    }

    if (!isEligibleForMiniDraw()) {
      console.log("🚫 Mini draw trigger: User not eligible");
      return;
    }

    if (isModalActive("special-packages")) {
      console.log("🚫 Special packages trigger: Modal already open");
      return;
    }

    // Don't show modal if it has already been shown in this session
    if (showOncePerSession && hasModalBeenShown()) {
      console.log("🚫 Mini draw trigger: Modal already shown in this session");
      return;
    }

    // Mark that we've attempted to trigger
    triggerAttemptedRef.current = true;

    console.log("🎯 Triggering special packages modal after delay:", delay);

    const timer = setTimeout(() => {
      console.log("🎯 Opening special packages modal via priority system");
      markModalAsShown(); // Mark as shown in session
      requestModal("special-packages", false); // Use priority system
    }, delay);

    return () => clearTimeout(timer);
  }, [
    enabled,
    isEligibleForMiniDraw,
    isModalActive,
    requestModal,
    delay,
    showOncePerSession,
    hasModalBeenShown,
    markModalAsShown,
  ]);

  /**
   * Auto-trigger on component mount (only once per session)
   */
  useEffect(() => {
    console.log("🎯 Mini draw useEffect triggered:", {
      showOncePerSession,
      isAuthenticated,
      hasModalBeenShown: hasModalBeenShown(),
      triggerAttempted: triggerAttemptedRef.current,
    });

    // Only trigger if we haven't shown the modal yet in this session
    if (showOncePerSession && !hasModalBeenShown()) {
      const cleanup = triggerMiniDrawModal();
      return cleanup;
    }
  }, [triggerMiniDrawModal, showOncePerSession, isAuthenticated, hasModalBeenShown]);

  /**
   * Manual trigger function (bypasses session check for testing)
   */
  const manualTrigger = useCallback(() => {
    console.log("🎯 Manual mini draw trigger");
    // Reset session state for manual trigger
    triggerAttemptedRef.current = false;

    // Clear sessionStorage flag for manual trigger
    clearSessionFlag();

    triggerMiniDrawModal();
  }, [triggerMiniDrawModal, clearSessionFlag]);

  return {
    isEligibleForMiniDraw,
    triggerMiniDrawModal: manualTrigger,
    isModalOpen: isModalActive("special-packages"),
    hasModalBeenShown,
    clearSessionFlag,
  };
};
