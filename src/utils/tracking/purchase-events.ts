/**
 * Purchase Event Utilities
 *
 * Provides utilities for dispatching and handling purchase completion events
 * that trigger optimistic updates across the application.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";

/**
 * Dispatch a purchase completion event for optimistic updates
 *
 * This function dispatches a custom event that components like PartnerDiscountQueue
 * can listen to for immediate UI updates before server confirmation.
 *
 * @param packageData - Package information from the purchase
 * @param packageType - Type of package (subscription, one-time, mini-draw, upsell)
 */
export const dispatchPurchaseCompleted = (packageData: {
  packageId: string;
  packageName: string;
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
}) => {
  try {
    // Get package details from static data
    let partnerDiscountDays = 0;
    let partnerDiscountHours = 0;

    if (packageData.packageType === "subscription" || packageData.packageType === "one-time") {
      const packageInfo = getPackageById(packageData.packageId);
      if (packageInfo) {
        partnerDiscountDays = packageInfo.partnerDiscountDays || 0;
      }
    } else if (packageData.packageType === "mini-draw") {
      const packageInfo = getMiniDrawPackageById(packageData.packageId);
      if (packageInfo) {
        partnerDiscountDays = packageInfo.partnerDiscountDays || 0;
        partnerDiscountHours = packageInfo.partnerDiscountHours || 0;
      }
    }

    // Only dispatch if package has partner discount benefits
    if (partnerDiscountDays > 0 || partnerDiscountHours > 0) {
      const event = new CustomEvent("purchaseCompleted", {
        detail: {
          packageData: {
            name: packageData.packageName,
            packageName: packageData.packageName,
            partnerDiscountDays,
            partnerDiscountHours,
          },
          packageType: packageData.packageType,
        },
      });

      window.dispatchEvent(event);

      console.log(`🎁 Dispatched purchase event for ${packageData.packageName}:`, {
        packageType: packageData.packageType,
        partnerDiscountDays,
        partnerDiscountHours,
      });
    }
  } catch (error) {
    console.error("Error dispatching purchase completed event:", error);
  }
};

/**
 * Hook for components that need to trigger purchase completion events
 *
 * @returns Object with dispatchPurchaseCompleted function
 */
export const usePurchaseEvents = () => {
  return {
    dispatchPurchaseCompleted,
  };
};

/**
 * Listen for purchase completion events
 *
 * @param callback - Function to call when purchase is completed
 * @returns Cleanup function to remove event listener
 */
export const listenForPurchaseCompleted = (callback: (event: CustomEvent) => void): (() => void) => {
  const handleEvent = (event: Event) => {
    callback(event as CustomEvent);
  };

  window.addEventListener("purchaseCompleted", handleEvent);

  // Return cleanup function
  return () => {
    window.removeEventListener("purchaseCompleted", handleEvent);
  };
};

/**
 * Dispatch package purchase completion with automatic package detection
 *
 * This is a convenience function that automatically detects package details
 * and dispatches the appropriate event.
 *
 * @param packageId - ID of the purchased package
 * @param packageType - Type of package
 */
export const dispatchPackagePurchase = (
  packageId: string,
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell"
) => {
  let packageName = "";

  try {
    if (packageType === "subscription" || packageType === "one-time") {
      const packageInfo = getPackageById(packageId);
      packageName = packageInfo?.name || packageId;
    } else if (packageType === "mini-draw") {
      const packageInfo = getMiniDrawPackageById(packageId);
      packageName = packageInfo?.name || packageId;
    } else {
      packageName = packageId; // Fallback for upsells
    }

    dispatchPurchaseCompleted({
      packageId,
      packageName,
      packageType,
    });
  } catch (error) {
    console.error("Error dispatching package purchase:", error);
  }
};
