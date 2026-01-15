/**
 * User Export Fields Service
 * 
 * Centralized service for defining all exportable user fields with metadata.
 * Provides field definitions, display names, types, groups, and default selections.
 */

/**
 * Field types for validation and formatting
 */
export type FieldType = "string" | "number" | "boolean" | "date" | "currency";

/**
 * Field groups for organization in UI
 */
export type FieldGroup = 
  | "basic"
  | "status"
  | "dates"
  | "subscription"
  | "financial"
  | "entries";

/**
 * Export field definition with metadata
 */
export interface ExportFieldDefinition {
  /** Internal field key (e.g., "firstName", "subscription.packageName") */
  key: string;
  /** Display name shown in UI and export headers */
  displayName: string;
  /** Field type for formatting */
  type: FieldType;
  /** Field group for UI organization */
  group: FieldGroup;
  /** Whether this field is a computed/calculated field (not directly on user model) */
  isComputed?: boolean;
  /** Whether this field is included in default export */
  isDefault?: boolean;
  /** Optional description for tooltips */
  description?: string;
}

/**
 * All available export fields with metadata
 */
export const EXPORT_FIELDS: ExportFieldDefinition[] = [
  // Basic Information
  {
    key: "firstName",
    displayName: "First Name",
    type: "string",
    group: "basic",
    isDefault: true,
  },
  {
    key: "lastName",
    displayName: "Last Name",
    type: "string",
    group: "basic",
    isDefault: true,
  },
  {
    key: "email",
    displayName: "Email",
    type: "string",
    group: "basic",
    isDefault: true,
  },
  {
    key: "mobile",
    displayName: "Mobile Number",
    type: "string",
    group: "basic",
    isDefault: true,
  },
  {
    key: "state",
    displayName: "State",
    type: "string",
    group: "basic",
    isDefault: true,
  },
  {
    key: "id",
    displayName: "User ID",
    type: "string",
    group: "basic",
  },
  {
    key: "role",
    displayName: "Role",
    type: "string",
    group: "basic",
  },

  // Account Status
  {
    key: "isActive",
    displayName: "Account Active",
    type: "boolean",
    group: "status",
  },
  {
    key: "isEmailVerified",
    displayName: "Email Verified",
    type: "boolean",
    group: "status",
  },
  {
    key: "isMobileVerified",
    displayName: "Mobile Verified",
    type: "boolean",
    group: "status",
  },
  {
    key: "profileSetupCompleted",
    displayName: "Profile Setup Completed",
    type: "boolean",
    group: "status",
  },

  // Dates
  {
    key: "createdAt",
    displayName: "Date Joined",
    type: "date",
    group: "dates",
  },
  {
    key: "lastLogin",
    displayName: "Last Login",
    type: "date",
    group: "dates",
  },

  // Subscription Details
  {
    key: "subscription.packageName",
    displayName: "Subscription Package",
    type: "string",
    group: "subscription",
    isDefault: true,
  },
  {
    key: "subscription.isActive",
    displayName: "Subscription Active",
    type: "boolean",
    group: "subscription",
    isDefault: true,
  },
  {
    key: "subscription.status",
    displayName: "Subscription Status",
    type: "string",
    group: "subscription",
  },
  {
    key: "subscription.startDate",
    displayName: "Subscription Start Date",
    type: "date",
    group: "subscription",
  },
  {
    key: "subscription.endDate",
    displayName: "Subscription End Date",
    type: "date",
    group: "subscription",
  },
  {
    key: "subscription.autoRenew",
    displayName: "Auto Renew",
    type: "boolean",
    group: "subscription",
  },

  // Financial
  {
    key: "totalSpent",
    displayName: "Total Spent",
    type: "currency",
    group: "financial",
    isComputed: true,
    isDefault: true,
    description: "Calculated from payment events",
  },

  // Entries & Rewards
  {
    key: "majorDrawEntries",
    displayName: "Major Draw Entries",
    type: "number",
    group: "entries",
    isComputed: true,
  },
  {
    key: "miniDrawCount",
    displayName: "Mini Draw Count",
    type: "number",
    group: "entries",
  },
  {
    key: "rewardsPoints",
    displayName: "Rewards Points",
    type: "number",
    group: "entries",
  },
  {
    key: "accumulatedEntries",
    displayName: "Accumulated Entries",
    type: "number",
    group: "entries",
  },
];

/**
 * Get all fields grouped by category
 */
export function getFieldsByGroup(): Record<FieldGroup, ExportFieldDefinition[]> {
  const grouped: Record<string, ExportFieldDefinition[]> = {
    basic: [],
    status: [],
    dates: [],
    subscription: [],
    financial: [],
    entries: [],
  };

  EXPORT_FIELDS.forEach((field) => {
    grouped[field.group].push(field);
  });

  return grouped as Record<FieldGroup, ExportFieldDefinition[]>;
}

/**
 * Get default selected fields
 */
export function getDefaultFields(): string[] {
  return EXPORT_FIELDS.filter((field) => field.isDefault).map((field) => field.key);
}

/**
 * Get field definition by key
 */
export function getFieldDefinition(key: string): ExportFieldDefinition | undefined {
  return EXPORT_FIELDS.find((field) => field.key === key);
}

/**
 * Validate that all provided field keys are valid
 */
export function validateFieldKeys(keys: string[]): { valid: boolean; invalidKeys: string[] } {
  const validKeys = EXPORT_FIELDS.map((field) => field.key);
  const invalidKeys = keys.filter((key) => !validKeys.includes(key));

  return {
    valid: invalidKeys.length === 0,
    invalidKeys,
  };
}

/**
 * Get display name for a field key
 */
export function getDisplayName(key: string): string {
  const field = getFieldDefinition(key);
  return field?.displayName || key;
}

/**
 * Get all field keys
 */
export function getAllFieldKeys(): string[] {
  return EXPORT_FIELDS.map((field) => field.key);
}

