"use client";

import { useMiniDrawTrigger } from "@/hooks/useMiniDrawTrigger";

/**
 * LandingPageTrigger Component
 * Handles special packages modal triggers for the landing page
 * Shows special packages modal for authenticated members with active subscriptions after a delay
 * Modal appears only once per session for better UX
 */
const LandingPageTrigger: React.FC = () => {
  // Trigger special packages modal for eligible members
  useMiniDrawTrigger({
    delay: 3000, // 3 seconds delay
    showOncePerSession: true, // Show only once per session for better UX
    enabled: true,
  });

  // This component doesn't render anything, it just handles the trigger logic
  return null;
};

export default LandingPageTrigger;
