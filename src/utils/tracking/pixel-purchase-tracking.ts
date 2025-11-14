/**
 * Pixel Purchase Tracking Utilities
 *
 * Provides server-side pixel tracking for all purchase events.
 * This ensures pixel events are fired for every purchase type.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { trackFacebookEvent } from "@/components/FacebookPixel";
import { trackTikTokEvent } from "@/components/TikTokPixel";

export interface PixelPurchaseParams {
  value: number;
  currency: string;
  orderId: string;
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
  packageId?: string;
  packageName?: string;
  userId?: string;
  userEmail?: string;
  entriesAdded?: number;
  pointsEarned?: number;
  subscriptionId?: string;
  paymentIntentId?: string;
  content_type?: string;
  content_ids?: string[];
  num_items?: number;
}

/**
 * Track purchase event for Facebook and TikTok pixels
 */
export async function trackPixelPurchase(params: PixelPurchaseParams): Promise<void> {
  try {
    const {
      value,
      currency,
      orderId,
      packageType,
      packageId,
      packageName,
      userId,
      userEmail,
      entriesAdded,
      pointsEarned,
      subscriptionId,
      paymentIntentId,
      content_type,
      content_ids,
      num_items,
    } = params;

    // Prepare common parameters
    const commonParams = {
      value,
      currency,
      orderId,
      content_type: content_type || getContentType(packageType),
      content_ids: content_ids || (packageId ? [packageId] : []),
      num_items: num_items || 1,
      // Custom parameters for Tools Australia
      package_type: packageType,
      package_id: packageId,
      package_name: packageName,
      entries_added: entriesAdded,
      points_earned: pointsEarned,
      subscription_id: subscriptionId,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel Purchase
    await trackFacebookEvent("Purchase", commonParams);
    console.log(`📘 Facebook Pixel: Purchase tracked for ${packageType} - $${value} ${currency}`);

    // Track TikTok Pixel Purchase
    await trackTikTokEvent("CompletePayment", commonParams);
    console.log(`📱 TikTok Pixel: Purchase tracked for ${packageType} - $${value} ${currency}`);
  } catch (error) {
    console.error("❌ Error tracking pixel purchase:", error);
    // Don't throw - pixel tracking should not break purchase flow
  }
}

/**
 * Track subscription events (Subscribe/Unsubscribe)
 */
export async function trackPixelSubscription(
  action: "Subscribe" | "Unsubscribe",
  params: {
    value: number;
    currency: string;
    packageId: string;
    packageName: string;
    subscriptionId: string;
    userId?: string;
    userEmail?: string;
    entriesPerMonth?: number;
    paymentIntentId?: string;
  }
): Promise<void> {
  try {
    const {
      value,
      currency,
      packageId,
      packageName,
      subscriptionId,
      userId,
      userEmail,
      entriesPerMonth,
      paymentIntentId,
    } = params;

    const commonParams = {
      value,
      currency,
      content_type: "subscription",
      content_ids: [packageId],
      subscription_id: subscriptionId,
      package_id: packageId,
      package_name: packageName,
      entries_per_month: entriesPerMonth,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel
    await trackFacebookEvent(action, commonParams);
    console.log(`📘 Facebook Pixel: ${action} tracked - ${packageName} - $${value} ${currency}`);

    // Track TikTok Pixel
    await trackTikTokEvent(action, commonParams);
    console.log(`📱 TikTok Pixel: ${action} tracked - ${packageName} - $${value} ${currency}`);
  } catch (error) {
    console.error(`❌ Error tracking pixel ${action}:`, error);
  }
}

/**
 * Track subscription upgrade events (subscription change, not purchase)
 */
export async function trackPixelSubscriptionUpgrade(params: {
  oldValue: number;
  newValue: number;
  currency: string;
  oldPackageId: string;
  newPackageId: string;
  oldPackageName: string;
  newPackageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesAdded?: number;
}): Promise<void> {
  try {
    const {
      oldValue,
      newValue,
      currency,
      oldPackageId,
      newPackageId,
      oldPackageName,
      newPackageName,
      subscriptionId,
      userId,
      userEmail,
      paymentIntentId,
      prorationAmount,
      entriesAdded,
    } = params;

    const commonParams = {
      value: Math.abs(newValue - oldValue), // Change amount
      currency,
      content_type: "subscription",
      content_ids: [newPackageId], // Focus on new package
      subscription_id: subscriptionId,
      old_package_id: oldPackageId,
      old_package_name: oldPackageName,
      old_value: oldValue,
      new_package_id: newPackageId,
      new_package_name: newPackageName,
      new_value: newValue,
      proration_amount: prorationAmount,
      entries_added: entriesAdded,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel - Use Subscribe event for upgrade
    await trackFacebookEvent("Subscribe", commonParams);
    console.log(`📘 Facebook Pixel: Subscription Upgrade tracked - ${oldPackageName} → ${newPackageName}`);

    // Track TikTok Pixel - Use Subscribe event for upgrade
    await trackTikTokEvent("Subscribe", commonParams);
    console.log(`📱 TikTok Pixel: Subscription Upgrade tracked - ${oldPackageName} → ${newPackageName}`);
  } catch (error) {
    console.error(`❌ Error tracking pixel subscription upgrade:`, error);
  }
}

/**
 * Track subscription downgrade events (subscription change, not purchase)
 */
export async function trackPixelSubscriptionDowngrade(params: {
  oldValue: number;
  newValue: number;
  currency: string;
  oldPackageId: string;
  newPackageId: string;
  oldPackageName: string;
  newPackageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesRemoved?: number;
}): Promise<void> {
  try {
    const {
      oldValue,
      newValue,
      currency,
      oldPackageId,
      newPackageId,
      oldPackageName,
      newPackageName,
      subscriptionId,
      userId,
      userEmail,
      paymentIntentId,
      prorationAmount,
      entriesRemoved,
    } = params;

    const commonParams = {
      value: Math.abs(newValue - oldValue), // Change amount
      currency,
      content_type: "subscription",
      content_ids: [newPackageId], // Focus on new package
      subscription_id: subscriptionId,
      old_package_id: oldPackageId,
      old_package_name: oldPackageName,
      old_value: oldValue,
      new_package_id: newPackageId,
      new_package_name: newPackageName,
      new_value: newValue,
      proration_amount: prorationAmount,
      entries_removed: entriesRemoved,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel - Use Subscribe event for downgrade (still a subscription)
    await trackFacebookEvent("Subscribe", commonParams);
    console.log(`📘 Facebook Pixel: Subscription Downgrade tracked - ${oldPackageName} → ${newPackageName}`);

    // Track TikTok Pixel - Use Subscribe event for downgrade (still a subscription)
    await trackTikTokEvent("Subscribe", commonParams);
    console.log(`📱 TikTok Pixel: Subscription Downgrade tracked - ${oldPackageName} → ${newPackageName}`);
  } catch (error) {
    console.error(`❌ Error tracking pixel subscription downgrade:`, error);
  }
}

/**
 * Get content type based on package type
 */
function getContentType(packageType: string): string {
  switch (packageType) {
    case "subscription":
      return "subscription";
    case "one-time":
      return "membership_package";
    case "mini-draw":
      return "mini_draw_package";
    case "upsell":
      return "upsell_package";
    default:
      return "product";
  }
}

/**
 * Track cancellation events
 */
export async function trackPixelCancellation(params: {
  value: number;
  currency: string;
  packageId: string;
  packageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  cancellationReason?: string;
}): Promise<void> {
  try {
    const { value, currency, packageId, packageName, subscriptionId, userId, userEmail, cancellationReason } = params;

    const commonParams = {
      value,
      currency,
      content_type: "subscription_cancellation",
      content_ids: [packageId],
      subscription_id: subscriptionId,
      package_id: packageId,
      package_name: packageName,
      cancellation_reason: cancellationReason,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel
    await trackFacebookEvent("Unsubscribe", commonParams);
    console.log(`📘 Facebook Pixel: Cancellation tracked - ${packageName}`);

    // Track TikTok Pixel
    await trackTikTokEvent("Unsubscribe", commonParams);
    console.log(`📱 TikTok Pixel: Cancellation tracked - ${packageName}`);
  } catch (error) {
    console.error("❌ Error tracking pixel cancellation:", error);
  }
}
