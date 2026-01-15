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
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";

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
  miniDrawParticipation?: Array<{ isActive?: boolean; [key: string]: unknown }>;
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

  // Fetch total spent for each user from PaymentEvent
  const paymentEvents = await PaymentEvent.find({
    userId: { $in: userIds },
    eventType: "BenefitsGranted",
  }).lean();

  // Calculate total spent per user
  paymentEvents.forEach((event) => {
    const userId = event.userId.toString();
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
  }
): TransformedUserData {
  const transformed: TransformedUserData = {};
  const userId = typeof user._id === "string" ? user._id : user._id.toString();

  // Map packageId to packageName if needed
  let packageName: string | null = null;
  if (user.subscription?.packageId) {
    packageName = getPackageName(user.subscription.packageId);
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
      // Count mini draws user is participating in
      value = (user.miniDrawParticipation || []).filter((p) => p.isActive !== false).length;
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

  const [totalSpentMap, majorDrawEntriesMap] = await Promise.all([
    needsTotalSpent ? calculateTotalSpent(userIds) : Promise.resolve(new Map<string, number>()),
    needsMajorDrawEntries ? calculateMajorDrawEntries(userIds) : Promise.resolve(new Map<string, number>()),
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
      }
    );
  });
}

