"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { identifyKlaviyoUser } from "@/utils/tracking/klaviyo-helpers";

/**
 * Klaviyo User Identifier Component
 *
 * Automatically identifies authenticated users in Klaviyo to populate "Active on Site"
 * and enable user-specific tracking. This component ensures users are identified:
 * - On page load if already authenticated
 * - After successful login (any method: regular, Google OAuth, auto-login)
 * - When session updates (e.g., after profile changes)
 *
 * Deduplication Strategy:
 * - Uses useRef to track the last identified email
 * - Only identifies when session.email changes (not on every render)
 * - Debounces rapid session updates to prevent duplicate calls
 * - Respects pixel consent settings
 *
 * This component follows the same pattern as other tracking components
 * (AffiliateTracker, ReferralTracker) for consistency.
 *
 * @example
 * ```tsx
 * <KlaviyoUserIdentifier />
 * ```
 */
export default function KlaviyoUserIdentifier() {
  const { data: session, status } = useSession();
  // Track last identified email to prevent duplicate identification calls
  const lastIdentifiedEmailRef = useRef<string | null>(null);
  // Debounce timer to handle rapid session updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only proceed if session is authenticated and has email
    if (status !== "authenticated" || !session?.user?.email) {
      // Reset tracking if user is no longer authenticated
      if (status === "unauthenticated") {
        lastIdentifiedEmailRef.current = null;
      }
      return;
    }

    const currentEmail = session.user.email;

    // Skip if we've already identified this email in this session
    if (lastIdentifiedEmailRef.current === currentEmail) {
      return;
    }

    // Debounce identification to handle rapid session updates (e.g., during auto-login)
    // This prevents multiple identification calls when session updates quickly
    debounceTimerRef.current = setTimeout(() => {
      try {
        // Identify user with available session data.
        // Trait keys match Klaviyo's standard profile-attribute field names so
        // they merge with the server-side upsert instead of creating duplicate
        // custom properties.
        identifyKlaviyoUser(currentEmail, {
          first_name: session.user.firstName || undefined,
          last_name: session.user.lastName || undefined,
          user_id: session.user.id || undefined,
        });

        // Mark this email as identified to prevent duplicates
        lastIdentifiedEmailRef.current = currentEmail;

        if (process.env.NODE_ENV === "development") {
          console.log("📧 Klaviyo: User identified", {
            email: currentEmail,
            first_name: session.user.firstName,
            last_name: session.user.lastName,
          });
        }
      } catch (error) {
        // Silently fail - don't break user experience
        if (process.env.NODE_ENV === "development") {
          console.error("❌ Klaviyo: Error identifying user", error);
        }
      }
    }, 100); // 100ms debounce to handle rapid session updates

    // Cleanup: clear debounce timer on unmount or dependency change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [status, session?.user?.email, session?.user?.firstName, session?.user?.lastName, session?.user?.id]);

  // This component doesn't render anything
  return null;
}
