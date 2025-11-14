/**
 * Partner Discount Queue Management Utility
 *
 * This module manages the stacking and activation of partner discount access periods
 * from multiple package purchases following e-commerce best practices:
 *
 * - FIFO (First In, First Out) queue system
 * - Automatic activation when previous period ends
 * - Subscription priority (subscriptions always take precedence)
 * - 12-month expiry on queued benefits
 * - Real-time calculation for flexibility
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import mongoose from "mongoose";
import { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * Interface for partner discount queue item
 * Used for type safety when adding or managing queue items
 */
export interface PartnerDiscountQueueItem {
  _id?: mongoose.Types.ObjectId;
  packageId: string;
  packageName: string;
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
  discountDays: number;
  discountHours: number;
  purchaseDate: Date;
  startDate?: Date;
  endDate?: Date;
  status: "active" | "queued" | "expired" | "cancelled";
  queuePosition: number;
  expiryDate: Date;
  stripePaymentIntentId?: string;
}

/**
 * Add a package purchase to the partner discount queue
 *
 * This function:
 * 1. Creates a queue item from the package purchase
 * 2. Determines correct queue position
 * 3. Auto-activates if no active subscription/period exists
 * 4. Otherwise queues it for future activation
 *
 * @param user - User document to update
 * @param packageData - Information about the purchased package
 * @returns The created queue item
 */
export async function addToPartnerDiscountQueue(
  user: IUser,
  packageData: {
    packageId: string;
    packageName: string;
    packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
    discountDays: number;
    discountHours?: number;
    stripePaymentIntentId?: string;
  }
): Promise<PartnerDiscountQueueItem> {
  console.log(`🎯 Adding to partner discount queue for user: ${user.email}`);
  console.log(`📦 Package: ${packageData.packageName} (${packageData.discountDays} days)`);

  // Initialize queue if it doesn't exist
  if (!user.partnerDiscountQueue) {
    user.partnerDiscountQueue = [];
  }

  // Create the queue item with 12-month expiry
  const purchaseDate = new Date();
  const expiryDate = new Date(purchaseDate);
  expiryDate.setMonth(expiryDate.getMonth() + 12); // Must be used within 12 months

  const queueItem: PartnerDiscountQueueItem = {
    packageId: packageData.packageId,
    packageName: packageData.packageName,
    packageType: packageData.packageType,
    discountDays: packageData.discountDays,
    discountHours: packageData.discountHours || packageData.discountDays * 24,
    purchaseDate,
    status: "queued",
    queuePosition: 0, // Will be calculated
    expiryDate,
    stripePaymentIntentId: packageData.stripePaymentIntentId,
  };

  // Check if user has active subscription
  const hasActiveSubscription = user.subscription?.isActive;

  // Check if there's already an active partner discount period (non-subscription)
  const activeQueueItem = user.partnerDiscountQueue.find(
    (item) => item.status === "active" && item.packageType !== "subscription"
  );

  // Determine queue position and status
  if (packageData.packageType === "subscription") {
    // Subscriptions always activate immediately and take priority
    // Pause any active non-subscription items
    user.partnerDiscountQueue.forEach((item) => {
      if (item.status === "active" && item.packageType !== "subscription") {
        item.status = "queued";
        item.startDate = undefined;
        item.endDate = undefined;
      }
    });

    queueItem.status = "active";
    queueItem.queuePosition = 0;
    queueItem.startDate = new Date();

    // Subscription ends when subscription ends (recurring)
    // We'll update this dynamically based on subscription status
    if (user.subscription?.endDate) {
      queueItem.endDate = user.subscription.endDate;
    }

    console.log(`✅ Subscription activated immediately with priority`);
  } else if (hasActiveSubscription || activeQueueItem) {
    // Queue this item behind the active period
    // Find the last item in queue to determine position
    const maxQueuePosition = Math.max(0, ...user.partnerDiscountQueue.map((item) => item.queuePosition));

    queueItem.queuePosition = maxQueuePosition + 1;
    queueItem.status = "queued";

    console.log(
      `📋 Item queued at position ${queueItem.queuePosition} (behind ${
        hasActiveSubscription ? "active subscription" : "active period"
      })`
    );
  } else {
    // No active subscription or period - activate immediately
    queueItem.status = "active";
    queueItem.queuePosition = 0;
    queueItem.startDate = new Date();

    const endDate = new Date(queueItem.startDate);
    endDate.setHours(endDate.getHours() + queueItem.discountHours);
    queueItem.endDate = endDate;

    console.log(`✅ Item activated immediately (no active periods)`);
    console.log(`⏰ Active until: ${endDate.toISOString()}`);
  }

  // Add to queue
  user.partnerDiscountQueue.push(queueItem);

  // Reorder queue positions to maintain consistency
  await reorderQueue(user);

  console.log(`✅ Partner discount queue updated. Total items: ${user.partnerDiscountQueue.length}`);

  return queueItem;
}

/**
 * Calculate the current active partner discount period
 *
 * This function determines which discount period (if any) is currently active
 * by checking:
 * 1. Active subscription (highest priority)
 * 2. Active queue items
 * 3. Expired items that need cleanup
 *
 * @param user - User document to check
 * @returns Active period info or null if no active period
 */
export function calculateActivePartnerDiscountPeriod(user: IUser): {
  isActive: boolean;
  source: "subscription" | "one-time" | "mini-draw" | "upsell" | null;
  packageName: string | null;
  endsAt: Date | null;
  daysRemaining: number;
  hoursRemaining: number;
  queuedItems: number;
} {
  const now = new Date();

  // Check for active subscription first (highest priority)
  if (user.subscription?.isActive) {
    // Handle subscriptions with endDate (billing cycle based)
    if (user.subscription.endDate) {
      const endsAt = new Date(user.subscription.endDate);
      const msRemaining = endsAt.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));

      // Get subscription package info
      const subscriptionPackage = getPackageById(user.subscription.packageId);

      return {
        isActive: true,
        source: "subscription",
        packageName: subscriptionPackage?.name || "Active Subscription",
        endsAt,
        daysRemaining,
        hoursRemaining,
        queuedItems: user.partnerDiscountQueue?.filter((item) => item.status === "queued").length || 0,
      };
    } else {
      // Handle ongoing subscriptions without endDate (continuous access)
      // Calculate next billing cycle (30 days from start date)
      const startDate = new Date(user.subscription.startDate);
      const nextBillingCycle = new Date(startDate);
      nextBillingCycle.setDate(startDate.getDate() + 30);

      // If we're past the first billing cycle, calculate from current date
      if (now > nextBillingCycle) {
        const cyclesPassed = Math.floor((now.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        nextBillingCycle.setDate(startDate.getDate() + (cyclesPassed + 1) * 30);
      }

      const msRemaining = nextBillingCycle.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));

      // Get subscription package info
      const subscriptionPackage = getPackageById(user.subscription.packageId);

      return {
        isActive: true,
        source: "subscription",
        packageName: subscriptionPackage?.name || "Active Subscription",
        endsAt: nextBillingCycle,
        daysRemaining,
        hoursRemaining,
        queuedItems: user.partnerDiscountQueue?.filter((item) => item.status === "queued").length || 0,
      };
    }
  }

  // Check for active queue item
  if (user.partnerDiscountQueue && user.partnerDiscountQueue.length > 0) {
    const activeItem = user.partnerDiscountQueue.find(
      (item) => item.status === "active" && item.endDate && new Date(item.endDate) > now
    );

    if (activeItem && activeItem.endDate) {
      const endsAt = new Date(activeItem.endDate);
      const msRemaining = endsAt.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));

      return {
        isActive: true,
        source: activeItem.packageType,
        packageName: activeItem.packageName,
        endsAt,
        daysRemaining,
        hoursRemaining,
        queuedItems: user.partnerDiscountQueue.filter((item) => item.status === "queued").length,
      };
    }
  }

  // No active period
  return {
    isActive: false,
    source: null,
    packageName: null,
    endsAt: null,
    daysRemaining: 0,
    hoursRemaining: 0,
    queuedItems: user.partnerDiscountQueue?.filter((item) => item.status === "queued").length || 0,
  };
}

/**
 * Process queue activations and expirations
 *
 * This function should be called:
 * 1. When a user logs in
 * 2. When checking partner discount status
 * 3. Via scheduled cron job for all users
 *
 * It handles:
 * - Expiring finished periods
 * - Activating next queued item
 * - Removing expired queue items (past 12-month limit)
 * - Cleaning up cancelled items
 *
 * @param user - User document to process
 * @returns Whether any changes were made
 */
export async function processPartnerDiscountQueue(user: IUser): Promise<boolean> {
  if (!user.partnerDiscountQueue || user.partnerDiscountQueue.length === 0) {
    return false;
  }

  let hasChanges = false;
  const now = new Date();

  console.log(`🔄 Processing partner discount queue for user: ${user.email}`);

  // Step 1: Remove expired queue items (past 12-month purchase date)
  const beforeCount = user.partnerDiscountQueue.length;
  user.partnerDiscountQueue = user.partnerDiscountQueue.filter((item) => {
    if (item.status === "queued" && new Date(item.expiryDate) < now) {
      console.log(`🗑️ Removing expired queued item: ${item.packageName} (purchased ${item.purchaseDate})`);
      return false;
    }
    return true;
  });

  if (user.partnerDiscountQueue.length < beforeCount) {
    hasChanges = true;
  }

  // Step 2: Mark finished active periods as expired
  user.partnerDiscountQueue.forEach((item) => {
    if (item.status === "active" && item.endDate && new Date(item.endDate) <= now) {
      console.log(`⏰ Marking active item as expired: ${item.packageName}`);
      item.status = "expired";
      hasChanges = true;
    }
  });

  // Step 3: Check if we need to activate next item in queue
  const hasActiveNonSubscription = user.partnerDiscountQueue.some(
    (item) => item.status === "active" && item.packageType !== "subscription"
  );

  const hasActiveSubscription = user.subscription?.isActive;

  // If no active subscription and no active queue item, activate the next queued item
  if (!hasActiveSubscription && !hasActiveNonSubscription) {
    const nextQueued = user.partnerDiscountQueue
      .filter((item) => item.status === "queued")
      .sort((a, b) => a.queuePosition - b.queuePosition)[0];

    if (nextQueued) {
      console.log(`✅ Activating next queued item: ${nextQueued.packageName}`);
      nextQueued.status = "active";
      nextQueued.queuePosition = 0;
      nextQueued.startDate = new Date();

      const endDate = new Date(nextQueued.startDate);
      endDate.setHours(endDate.getHours() + nextQueued.discountHours);
      nextQueued.endDate = endDate;

      console.log(`⏰ Active until: ${endDate.toISOString()}`);
      hasChanges = true;
    }
  }

  // Step 4: Reorder queue positions
  if (hasChanges) {
    await reorderQueue(user);
  }

  // Step 5: Clean up old expired items (keep only last 3 for history)
  const expiredItems = user.partnerDiscountQueue.filter((item) => item.status === "expired");
  if (expiredItems.length > 3) {
    // Sort by endDate and keep only the 3 most recent expired items
    const sortedExpired = expiredItems.sort((a, b) => {
      const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
      const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
      return dateB - dateA;
    });

    const toKeep = sortedExpired.slice(0, 3);
    user.partnerDiscountQueue = user.partnerDiscountQueue.filter(
      (item) => item.status !== "expired" || toKeep.includes(item)
    );
    hasChanges = true;
  }

  if (hasChanges) {
    console.log(`✅ Queue processing complete. Total items: ${user.partnerDiscountQueue.length}`);
  }

  return hasChanges;
}

/**
 * Reorder queue positions to maintain consistency
 *
 * This ensures queue positions are sequential (0, 1, 2, ...)
 * and handles gaps that may occur from cancellations/expirations
 *
 * @param user - User document to reorder
 */
export async function reorderQueue(user: IUser): Promise<void> {
  if (!user.partnerDiscountQueue || user.partnerDiscountQueue.length === 0) {
    return;
  }

  // Sort by current queue position, then by purchase date
  const sortedQueue = user.partnerDiscountQueue
    .filter((item) => item.status !== "expired" && item.status !== "cancelled")
    .sort((a, b) => {
      // Active items first
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;

      // Then by queue position
      if (a.queuePosition !== b.queuePosition) {
        return a.queuePosition - b.queuePosition;
      }

      // Then by purchase date (FIFO)
      return new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime();
    });

  // Reassign positions
  sortedQueue.forEach((item, index) => {
    item.queuePosition = index;
  });
}

/**
 * Handle subscription activation/deactivation in the queue
 *
 * When a subscription starts:
 * - Pause all non-subscription active items
 * - Add subscription to queue as active (position 0)
 *
 * When a subscription ends:
 * - Mark subscription item as expired
 * - Activate next queued item
 *
 * @param user - User document to update
 * @param action - Whether subscription is starting or ending
 */
export async function handleSubscriptionQueueUpdate(
  user: IUser,
  action: "start" | "end",
  subscriptionData?: {
    packageId: string;
    packageName: string;
    endDate: Date;
  }
): Promise<void> {
  if (!user.partnerDiscountQueue) {
    user.partnerDiscountQueue = [];
  }

  if (action === "start" && subscriptionData) {
    console.log(`🎯 Activating subscription in partner discount queue: ${subscriptionData.packageName}`);

    // Pause any active non-subscription items
    user.partnerDiscountQueue.forEach((item) => {
      if (item.status === "active" && item.packageType !== "subscription") {
        console.log(`⏸️ Pausing active item: ${item.packageName}`);
        item.status = "queued";
        item.startDate = undefined;
        item.endDate = undefined;
      }
    });

    // Add or update subscription in queue
    const existingSubscription = user.partnerDiscountQueue.find(
      (item) => item.packageType === "subscription" && item.packageId === subscriptionData.packageId
    );

    if (existingSubscription) {
      existingSubscription.status = "active";
      existingSubscription.queuePosition = 0;
      existingSubscription.startDate = new Date();
      existingSubscription.endDate = subscriptionData.endDate;
    } else {
      const subscriptionItem: PartnerDiscountQueueItem = {
        packageId: subscriptionData.packageId,
        packageName: subscriptionData.packageName,
        packageType: "subscription",
        discountDays: 30, // Monthly subscription
        discountHours: 30 * 24,
        purchaseDate: new Date(),
        startDate: new Date(),
        endDate: subscriptionData.endDate,
        status: "active",
        queuePosition: 0,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      };

      user.partnerDiscountQueue.push(subscriptionItem);
    }

    await reorderQueue(user);
    console.log(`✅ Subscription activated in queue`);
  } else if (action === "end") {
    console.log(`🛑 Ending subscription in partner discount queue`);

    // Mark subscription items as expired
    user.partnerDiscountQueue.forEach((item) => {
      if (item.packageType === "subscription" && item.status === "active") {
        console.log(`⏰ Marking subscription as expired: ${item.packageName}`);
        item.status = "expired";
      }
    });

    // Process queue to activate next item
    await processPartnerDiscountQueue(user);

    console.log(`✅ Subscription ended in queue, next item activated if available`);
  }
}

/**
 * Cancel a specific queue item (for refunds)
 *
 * @param user - User document
 * @param paymentIntentId - Stripe payment intent ID to cancel
 * @returns Whether the item was found and cancelled
 */
export async function cancelQueueItem(user: IUser, paymentIntentId: string): Promise<boolean> {
  if (!user.partnerDiscountQueue || user.partnerDiscountQueue.length === 0) {
    return false;
  }

  const itemToCancel = user.partnerDiscountQueue.find(
    (item) => item.stripePaymentIntentId === paymentIntentId && item.status !== "expired"
  );

  if (!itemToCancel) {
    return false;
  }

  console.log(`❌ Cancelling queue item: ${itemToCancel.packageName} (refund)`);

  // Check if this was the active item before cancelling
  const wasActive = itemToCancel.queuePosition === 0 && itemToCancel.status === "active";

  itemToCancel.status = "cancelled";

  // If this was the active item, activate the next one
  if (wasActive) {
    await processPartnerDiscountQueue(user);
  }

  await reorderQueue(user);

  return true;
}

/**
 * Get queue summary for display
 *
 * @param user - User document
 * @returns Formatted queue information for UI display
 */
export function getQueueSummary(user: IUser) {
  const activePeriod = calculateActivePartnerDiscountPeriod(user);

  const queuedItems =
    user.partnerDiscountQueue
      ?.filter((item) => item.status === "queued")
      .sort((a, b) => a.queuePosition - b.queuePosition)
      .slice(0, 5) // Show next 5 items
      .map((item) => ({
        packageName: item.packageName,
        packageType: item.packageType,
        daysOfAccess: item.discountDays,
        hoursOfAccess: item.discountHours,
        purchaseDate: item.purchaseDate,
        queuePosition: item.queuePosition,
        expiryDate: item.expiryDate,
      })) || [];

  return {
    activePeriod,
    queuedItems,
    totalQueuedDays: queuedItems.reduce((sum, item) => sum + item.daysOfAccess, 0),
    totalQueuedItems: user.partnerDiscountQueue?.filter((item) => item.status === "queued").length || 0,
  };
}
