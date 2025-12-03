"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { useSidebar } from "@/contexts/SidebarContext";

/**
 * FloatingPromoBanner Component
 * Displays a floating promo badge at the bottom of the screen
 * - On mini draw pages: Shows mini-packages promo if active, otherwise hides banner
 * - On other pages: Syncs with MembershipSection active tab (membership or one-time)
 * - Hides when user is at the bottom of the page and reappears when scrolling up
 * - Hidden on shop pages and admin pages
 */
const FloatingPromoBanner: React.FC = () => {
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get promos for each type
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const { data: oneTimePromo } = usePromoByType("one-time-packages");
  const { data: miniPromo } = usePromoByType("mini-packages");

  // Check if we're on a mini draw page (main page or details pages)
  const isMiniDrawPage = pathname?.startsWith("/mini-draws");

  // Check if we're on a shop page
  const isShopPage = pathname?.startsWith("/shop");

  // Check if we're on an admin page
  const isAdminPage = pathname?.startsWith("/admin");

  // Check if we're on an affiliate page
  const isAffiliatePage = pathname?.startsWith("/affiliate");

  // Check if we're on a login page
  const isLoginPage = pathname === "/login";

  // Check if we're on a terms page
  const isTermsPage = pathname === "/terms";

  // Check if we're on a privacy page
  const isPrivacyPage = pathname === "/privacy";

  // Check if we're on a competition terms page
  const isCompetitionTermsPage = pathname === "/competition-term-majordraw";

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

  // Handle scroll detection to show/hide banner at bottom of page
  useEffect(() => {
    const handleScroll = () => {
      // Clear any existing timeout to debounce scroll events
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Debounce scroll events for better performance
      scrollTimeoutRef.current = setTimeout(() => {
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollBottom = scrollTop + windowHeight;

        // Threshold: consider user at bottom if within 100px from the bottom
        const bottomThreshold = 100;
        const isAtBottom = scrollBottom >= documentHeight - bottomThreshold;

        // Determine scroll direction
        const currentScrollY = window.scrollY;
        const isScrollingUp = currentScrollY < lastScrollY.current;

        // Update visibility based on scroll position and direction
        if (isAtBottom) {
          // Hide banner when at the bottom of the page
          setIsVisible(false);
        } else {
          // Show banner when:
          // - User is scrolling up (regardless of position)
          // - User is not at the bottom of the page
          if (isScrollingUp || !isAtBottom) {
            setIsVisible(true);
          }
        }

        // Update last scroll position
        lastScrollY.current = currentScrollY;
      }, 10); // Small debounce for smooth performance
    };

    // Initial check on mount
    handleScroll();

    // Add scroll event listener
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
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

  // Don't render at all if:
  // - On 404 page
  // - Sidebar is open
  // - On shop page (hide banner on all shop pages)
  // - On admin page (hide banner on all admin pages)
  // - On affiliate page (hide banner on all affiliate pages)
  // - On login page (hide banner on login page)
  // - On terms page (hide banner on terms page)
  // - On privacy page (hide banner on privacy page)
  // - On competition terms page (hide banner on competition terms page)
  // - On mini draw page but no active mini promo (hide if no promo available)
  // - No active promo for current context
  if (
    pathname === "/not-found" ||
    isAnySidebarOpen ||
    isShopPage ||
    isAdminPage ||
    isAffiliatePage ||
    isLoginPage ||
    isTermsPage ||
    isPrivacyPage ||
    isCompetitionTermsPage ||
    (isMiniDrawPage && !miniPromo) ||
    !activePromo
  ) {
    return null;
  }

  // Determine if banner should be visible (considering scroll position)
  const shouldShowBanner = isVisible;

  return (
    <AnimatePresence>
      {shouldShowBanner && (
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
      )}
    </AnimatePresence>
  );
};

export default FloatingPromoBanner;
