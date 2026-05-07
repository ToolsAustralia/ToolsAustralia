"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSession } from "next-auth/react";
import { getPartnerDiscountBenefitTextForPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";

/**
 * Component that checks for successful subscription upgrades/downgrades after page reload
 * and shows appropriate toast messages
 *
 * ENHANCED VERSION:
 * - Shows detailed upgrade/downgrade information
 * - Invalidates React Query cache for fresh data
 * - Uses centralized toast system
 * - Displays comprehensive benefit information
 * - Forces immediate refetch of major draw stats
 */
export default function UpgradeSuccessToast() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  useEffect(() => {
    // Check for successful upgrade
    const upgradeData = localStorage.getItem("subscription_upgraded");
    // Check for successful downgrade (set by downgrade flow)
    const downgradeData = localStorage.getItem("subscription_downgraded");

    // Handle Upgrade Success
    if (upgradeData) {
      try {
        const {
          packageName,
          packageId,
          timestamp,
          entriesPerMonth,
          totalEntriesAfterUpgrade,
          partnerDiscountDays,
        } = JSON.parse(upgradeData) as {
          packageName: string;
          packageId?: string;
          timestamp: number;
          entriesPerMonth?: number;
          totalEntriesAfterUpgrade?: number;
          partnerDiscountDays?: number;
        };

        // Only show toast if the upgrade happened within the last 15 seconds
        // This prevents showing the toast on subsequent page loads
        const timeDiff = Date.now() - timestamp;
        if (timeDiff < 15000) {
          // 15 seconds
          // Use totalEntriesAfterUpgrade if available (includes accumulated + new upgrade entries)
          // Otherwise fall back to entriesPerMonth for backward compatibility
          const displayEntries = totalEntriesAfterUpgrade || entriesPerMonth;

          const partnerLine = packageId ? getPartnerDiscountBenefitTextForPackageId(packageId) : null;
          const partnerClause = partnerLine
            ? ` and ${partnerLine}`
            : partnerDiscountDays && partnerDiscountDays > 0
              ? ` and ${partnerDiscountDays} days of partner benefits access`
              : " and partner benefits access";

          showToast({
            type: "success",
            title: "Membership Upgraded Successfully!",
            message: `Welcome to ${packageName} membership! You now have ${displayEntries} Free Accumulated Entries${partnerClause}. Your new benefits are active immediately!`,
            duration: 25000, // Show for 25 seconds for important upgrade info
            testId: "upgrade-success-toast",
            action: {
              label: "View Benefits",
              onClick: () => (window.location.href = "/my-account"),
            },
          });

          // Invalidate all relevant caches to fetch fresh data
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.all });
          queryClient.invalidateQueries({ queryKey: ["subscription-benefits"] });

          // Add delay to ensure webhook has finished processing before refetching
          // Webhook needs time to update majorDraw.entries aggregation
          setTimeout(() => {
            // console.log("🔄 Refetching major draw data after webhook processing...");

            // Force refetch of major draw data for accurate entry counts
            queryClient.refetchQueries({ queryKey: queryKeys.majorDraw.current });

            // Refetch user-specific stats if session is available
            if (session?.user?.id) {
              queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
              queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(session.user.id) });
              queryClient.refetchQueries({ queryKey: queryKeys.majorDraw.userStats(session.user.id) });
            }

            // console.log("✅ All data refetched with latest entries from webhook");
          }, 2000); // Wait 2 seconds for webhook to complete

          // console.log("✅ Upgrade toast displayed, caches will refresh shortly");
        }

        // Clear the flag after showing the toast
        localStorage.removeItem("subscription_upgraded");
      } catch (error) {
        console.error("Error parsing upgrade data:", error);
        // Clear invalid data
        localStorage.removeItem("subscription_upgraded");
      }
    }

    // Handle Downgrade Success
    if (downgradeData) {
      try {
        const { currentPackageName, newPackageName, daysUntilChange, effectiveDate, timestamp } =
          JSON.parse(downgradeData);

        // Only show toast if the downgrade happened within the last 15 seconds
        const timeDiff = Date.now() - timestamp;
        if (timeDiff < 15000) {
          showToast({
            type: "success",
            title: "Downgrade Scheduled Successfully!",
            message: `You'll keep all your ${currentPackageName} benefits for ${daysUntilChange} more days. Your ${newPackageName} membership starts on ${new Date(
              effectiveDate
            ).toLocaleDateString()}. No refunds, but you keep what you paid for!`,
            duration: 15000, // Show for 15 seconds for important info
            testId: "downgrade-scheduled-toast",
          });

          // Invalidate caches immediately
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
          queryClient.invalidateQueries({ queryKey: ["subscription-benefits"] });

          // Force refetch user data to show preserved benefits immediately
          setTimeout(() => {
            // console.log("🔄 Refetching data for downgrade...");
            queryClient.refetchQueries({ queryKey: queryKeys.majorDraw.current });

            // Refetch user-specific data if session is available
            if (session?.user?.id) {
              queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
              queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(session.user.id) });
              queryClient.refetchQueries({ queryKey: queryKeys.majorDraw.userStats(session.user.id) });
            }

            // console.log("✅ All data refetched for downgrade");
          }, 1000); // Small delay for data consistency

          // console.log("✅ Downgrade toast displayed, caches will refresh shortly");
        }

        // Clear the flag
        localStorage.removeItem("subscription_downgraded");
      } catch (error) {
        console.error("Error parsing downgrade data:", error);
        localStorage.removeItem("subscription_downgraded");
      }
    }
  }, [showToast, queryClient, session]);

  // This component doesn't render anything
  return null;
}
