"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { useSidebar } from "@/contexts/SidebarContext";

/**
 * FloatingPromoBanner Component
 * Displays a floating promo badge at the bottom of the screen
 * - On mini draw details pages: Shows mini-packages promo (or hides if none active)
 * - On other pages: Syncs with MembershipSection active tab (membership or one-time)
 */
const FloatingPromoBanner: React.FC = () => {
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");

  // Get promos for each type
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const { data: oneTimePromo } = usePromoByType("one-time-packages");
  const { data: miniPromo } = usePromoByType("mini-packages");

  // Check if we're on a mini draw details page
  const isMiniDrawPage = pathname?.startsWith("/mini-draws/") && pathname !== "/mini-draws";

  // Listen for tab changes from MembershipSection
  useEffect(() => {
    const handleTabChange = (event: CustomEvent<{ activeTab: "membership" | "one-time" }>) => {
      setActiveTab(event.detail.activeTab);
    };

    window.addEventListener("membershipTabChanged", handleTabChange as EventListener);

    return () => {
      window.removeEventListener("membershipTabChanged", handleTabChange as EventListener);
    };
  }, []);

  // Determine which promo to display
  const getActivePromo = () => {
    // On mini draw details page: show mini-packages promo
    if (isMiniDrawPage) {
      return miniPromo;
    }

    // On other pages: show promo based on active tab
    if (activeTab === "membership") {
      return membershipPromo;
    } else {
      return oneTimePromo;
    }
  };

  const activePromo = getActivePromo();

  // Don't render if:
  // - On 404 page
  // - Sidebar is open
  // - On mini draw page but no mini promo active
  // - No active promo for current context
  if (pathname === "/not-found" || isAnySidebarOpen || (isMiniDrawPage && !miniPromo) || !activePromo) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        key="floating-promo-banner"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed bottom-0 left-0 right-0 z-[40] shadow-2xl border-t-2 border-yellow-300"
        style={{
          background: `linear-gradient(135deg, #ef4444 0%, #dc2626 25%, #b91c1c 50%, #991b1b 75%, #ef4444 100%)`,
          boxShadow: `0 -10px 30px rgba(239, 68, 68, 0.7), 0 0 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
        }}
      >
        <div className="max-w-7xl mx-auto px-1 sm:px-4 py-1 sm:py-2">
          {/* Centered badge only - no text */}
          <div className="flex items-center justify-center">
            <PromoBadge
              multiplier={activePromo.multiplier as 2 | 3 | 5 | 10}
              size="small"
              customText="ENTRY BOOST ENDING SOON"
            />
          </div>

          {/* Animated background effect */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(239, 68, 68, 0.25) 25%, rgba(220, 38, 38, 0.35) 50%, rgba(185, 28, 28, 0.25) 75%, rgba(239, 68, 68, 0.15) 100%)`,
              animation: "pulse 2s infinite",
            }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FloatingPromoBanner;
