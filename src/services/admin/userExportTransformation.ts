/**
 * User Export Transformation Service
 * 
 * Service responsible for:
 * - Calculating computed fields (totalSpent, majorDrawEntries)
 * - Transforming user data based on selected fields
 * - Formatting field values (dates, currency, booleans)
 * - Handling nested field extraction
 */

import type { ExportFieldDefinition } from "./userExportFields";
import { getFieldDefinition } from "./userExportFields";
import { getPackageById } from "@/data/membershipPackages";
import { SUBSCRIBED_SUBSCRIPTION_STATUSES } from "@/utils/admin/userFilterBuilder";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";

/**
 * User data type from database (lean document)
 * Matches the actual MongoDB User model structure when using .lean()
 * Uses a flexible type to handle MongoDB's FlattenMaps return type
 */
export type UserLeanDocument = {
  _id: { toString: () => string } | string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  profileSetupCompleted?: boolean;
  createdAt: Date | string;
  lastLogin?: Date | string;
  subscription?: {
    packageId?: string | null | { toString: () => string }; // Can be null in the model, optional due to MongoDB structure
    isActive?: boolean;
    startDate?: Date | string;
    endDate?: Date | string;
    status?: string;
    autoRenew?: boolean;
    [key: string]: unknown; // Allow other properties from MongoDB
  };
  miniDrawParticipation?: Array<{
    isActive?: boolean;
    miniDrawId?: unknown;
    totalEntries?: number;
    entriesBySource?: { "mini-draw-package"?: number; [k: string]: unknown };
    [key: string]: unknown;
  }>;
  /** Purchase ledger — one row per mini-draw package bought, $pull-ed on refund. */
  miniDrawPackages?: Array<{ entriesGranted?: number; packageId?: string; [k: string]: unknown }>;
  rewardsPoints?: number;
  accumulatedEntries?: number;
  [key: string]: unknown; // Allow other properties from MongoDB
}

/**
 * Transformed user data for export
 */
export interface TransformedUserData {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Calculate total spent for users from PaymentEvent
 * 
 * @param userIds - Array of user IDs
 * @returns Map of userId to totalSpent
 */
export async function calculateTotalSpent(userIds: string[]): Promise<Map<string, number>> {
  const userSpentMap = new Map<string, number>();

  if (userIds.length === 0) {
    return userSpentMap;
  }

  // Fetch BenefitsGranted and RefundProcessed for these users (Option B: only count non-refunded payments)
  const [paymentEvents, refundEvents] = await Promise.all([
    PaymentEvent.find({
      userId: { $in: userIds },
      eventType: "BenefitsGranted",
    }).lean(),
    PaymentEvent.find({
      userId: { $in: userIds },
      eventType: "RefundProcessed",
    })
      .select("userId paymentIntentId")
      .lean(),
  ]);

  const refundedKeys = new Set(
    refundEvents.map((e) => `${e.userId.toString()}|${e.paymentIntentId}`)
  );

  // Calculate total spent per user (exclude BenefitsGranted that have a matching RefundProcessed)
  paymentEvents.forEach((event) => {
    const userId = event.userId.toString();
    const key = `${userId}|${event.paymentIntentId}`;
    if (refundedKeys.has(key)) return;
    const currentSpent = userSpentMap.get(userId) || 0;
    userSpentMap.set(userId, currentSpent + (event.data?.price || 0));
  });

  return userSpentMap;
}

/**
 * Calculate major draw entries for users from MajorDraw
 * 
 * @param userIds - Array of user IDs
 * @returns Map of userId to majorDrawEntries
 */
export async function calculateMajorDrawEntries(userIds: string[]): Promise<Map<string, number>> {
  const userEntriesMap = new Map<string, number>();

  if (userIds.length === 0) {
    return userEntriesMap;
  }

  // Get current major draw entries for each user
  const currentMajorDraw = await MajorDraw.findOne({ status: "active" }).lean();

  if (currentMajorDraw && currentMajorDraw.entries) {
    currentMajorDraw.entries.forEach(
      (entry: { userId: { toString: () => string } | string; totalEntries?: number; quantity?: number }) => {
        const userId = typeof entry.userId === "string" ? entry.userId : entry.userId.toString();
        const currentEntries = userEntriesMap.get(userId) || 0;
        // Use totalEntries if available, otherwise fall back to quantity
        const entryCount = entry.totalEntries || entry.quantity || 0;
        userEntriesMap.set(userId, currentEntries + entryCount);
      }
    );
  }

  return userEntriesMap;
}

/**
 * Format field value based on field type
 * 
 * @param value - Raw value to format
 * @param fieldType - Type of field for formatting
 * @returns Formatted value as string
 */
export function formatFieldValue(value: unknown, fieldType: ExportFieldDefinition["type"]): string {
  if (value === null || value === undefined) {
    return "";
  }

  switch (fieldType) {
    case "boolean":
      return value === true ? "Yes" : value === false ? "No" : "";
    case "date":
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]; // YYYY-MM-DD format
      }
      if (typeof value === "string") {
        try {
          return new Date(value).toISOString().split("T")[0];
        } catch {
          return value;
        }
      }
      return String(value);
    case "currency":
      const numValue = typeof value === "number" ? value : parseFloat(String(value));
      if (isNaN(numValue)) {
        return "$0.00";
      }
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numValue);
    case "number":
      const num = typeof value === "number" ? value : parseFloat(String(value));
      return isNaN(num) ? "0" : num.toString();
    case "string":
    default:
      return String(value);
  }
}

/**
 * Extract nested field value from user object
 * 
 * @param user - User object
 * @param fieldKey - Field key (may be nested like "subscription.packageName")
 * @returns Extracted value
 */
export function extractNestedField(user: UserLeanDocument, fieldKey: string): unknown {
  // Handle direct fields
  if (!fieldKey.includes(".")) {
    return (user as Record<string, unknown>)[fieldKey];
  }

  // Handle nested fields
  const parts = fieldKey.split(".");
  let value: unknown = user;

  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== "object") {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Get package name from packageId
 * 
 * @param packageId - Package ID
 * @returns Package name or null
 */
export function getPackageName(packageId: string | { toString: () => string } | undefined | null): string | null {
  if (!packageId) {
    return null;
  }

  const idString = typeof packageId === "string" ? packageId : packageId.toString();
  const packageData = getPackageById(idString);
  return packageData?.name || null;
}

/**
 * Transform user data for export based on selected fields
 * 
 * @param user - User document from database
 * @param selectedFields - Array of field keys to include in export
 * @param computedFields - Pre-calculated computed fields (totalSpent, majorDrawEntries)
 * @returns Transformed user data object
 */
export function transformUserData(
  user: UserLeanDocument,
  selectedFields: string[],
  computedFields: {
    totalSpent: number;
    majorDrawEntries: number;
    /**
     * Ids of mini draws that are active RIGHT NOW, resolved once per export.
     *
     * Required for the Mini Draw Count column to agree with the `inActiveMiniDraw` FILTER. Both
     * now read the MiniDraw collection instead of the denormalised
     * `miniDrawParticipation[].isActive` flag, which is only cleared on winner selection and goes
     * stale when an admin changes a draw's status. Before this, filtering "in an active mini
     * draw" and exporting produced a count column that disagreed with the rows describing it.
     */
    activeMiniDrawIds: Set<string>;
  }
): TransformedUserData {
  const transformed: TransformedUserData = {};
  const userId = typeof user._id === "string" ? user._id : user._id.toString();

  // Map packageId to packageName — only for a CURRENT membership.
  // A cancelled/expired member keeps subscription.packageId set (it's the "current package after
  // any changes", never cleared), so without this gate the "Subscription Package" column shows a
  // stale package for someone who is no longer subscribed — misleading on an audience export that
  // may omit the "Subscription Active" column.
  // "Current" reuses the app's SUBSCRIBED_SUBSCRIPTION_STATUSES set (active / trialing / past_due
  // — subscribed incl. payment-problem-but-not-ended), so past_due members (a lapsed-but-
  // recoverable win-back audience) DO show their package, while fully cancelled / unpaid members
  // (isActive=false, non-subscribed status) stay blank. The isActive===true fallback covers any
  // legacy record that is active but has no status set; trialing is included via the constant even
  // if its isActive flag ever lags.
  const sub = user.subscription;
  const isCurrentMembership =
    sub?.isActive === true ||
    (typeof sub?.status === "string" &&
      (SUBSCRIBED_SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status));
  let packageName: string | null = null;
  if (isCurrentMembership && sub?.packageId) {
    packageName = getPackageName(sub.packageId);
  }

  // Process each selected field
  selectedFields.forEach((fieldKey) => {
    const fieldDef = getFieldDefinition(fieldKey);
    if (!fieldDef) {
      // Skip invalid fields
      return;
    }

    let value: unknown;

    // Handle computed fields
    if (fieldKey === "totalSpent") {
      value = computedFields.totalSpent;
    } else if (fieldKey === "majorDrawEntries") {
      value = computedFields.majorDrawEntries;
    } else if (fieldKey === "subscription.packageName") {
      // Special handling for packageName (needs to be extracted from subscription.packageId)
      value = packageName;
    } else if (fieldKey === "miniDrawCount") {
      // Mini draws the user currently holds entries in, counted against the CURRENTLY-ACTIVE
      // draw ids so this matches the inActiveMiniDraw filter exactly — see computedFields.
      value = (user.miniDrawParticipation || []).filter(
        (p) =>
          (p.totalEntries ?? 0) > 0 &&
          p.miniDrawId != null &&
          computedFields.activeMiniDrawIds.has(String(p.miniDrawId))
      ).length;
    } else if (fieldKey === "miniPackEntries") {
      // Entries granted by mini-draw package PURCHASES, lifetime.
      //
      // Read off the purchase ledger, not entriesBySource — that bucket is reset to 0 for every
      // participant when a winner is selected, and is also written by upsells and admin entry
      // edits. `miniDrawPackages` survives winner selection and is $pull-ed on refund, so this
      // is genuinely lifetime and genuinely a purchase.
      value = (user.miniDrawPackages || []).reduce((sum, p) => sum + (p.entriesGranted ?? 0), 0);
    } else if (fieldKey === "miniPacksBought") {
      // How many mini-draw packages they have bought and kept (refunds are $pull-ed).
      value = (user.miniDrawPackages || []).length;
    } else if (fieldKey === "id") {
      // Use userId as id
      value = userId;
    } else {
      // Extract value from user object (handles nested fields)
      value = extractNestedField(user, fieldKey);
    }

    // Format the value based on field type
    transformed[fieldKey] = formatFieldValue(value, fieldDef.type);
  });

  return transformed;
}

/**
 * Transform multiple users for export
 * 
 * @param users - Array of user documents
 * @param selectedFields - Array of field keys to include
 * @returns Promise resolving to array of transformed user data
 */
export async function transformUsersForExport(
  users: UserLeanDocument[],
  selectedFields: string[]
): Promise<TransformedUserData[]> {
  if (users.length === 0) {
    return [];
  }

  // Extract user IDs
  const userIds = users.map((user) => (typeof user._id === "string" ? user._id : user._id.toString()));

  // Calculate computed fields in parallel
  const needsTotalSpent = selectedFields.includes("totalSpent");
  const needsMajorDrawEntries = selectedFields.includes("majorDrawEntries");
  const needsActiveMiniDraws = selectedFields.includes("miniDrawCount");

  const [totalSpentMap, majorDrawEntriesMap, activeMiniDrawIds] = await Promise.all([
    needsTotalSpent ? calculateTotalSpent(userIds) : Promise.resolve(new Map<string, number>()),
    needsMajorDrawEntries ? calculateMajorDrawEntries(userIds) : Promise.resolve(new Map<string, number>()),
    // One query for the whole export, not one per user.
    needsActiveMiniDraws
      ? MiniDraw.find({ status: "active" })
          .select("_id")
          .lean()
          .then((docs) => new Set(docs.map((d: { _id: unknown }) => String(d._id))))
      : Promise.resolve(new Set<string>()),
  ]);

  // Transform each user
  return users.map((user) => {
    const userId = typeof user._id === "string" ? user._id : user._id.toString();
    return transformUserData(
      user,
      selectedFields,
      {
        totalSpent: totalSpentMap.get(userId) || 0,
        majorDrawEntries: majorDrawEntriesMap.get(userId) || 0,
        activeMiniDrawIds,
      }
    );
  });
}

