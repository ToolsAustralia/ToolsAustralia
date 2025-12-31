/**
 * Mini Draw Sorting Type Definitions
 */

export type SortField = "displayOrder" | "createdAt" | "prizeValue" | "totalEntries" | "minimumEntries" | "name";
export type SortOrder = "asc" | "desc";

export interface SortOption {
  field: SortField;
  order: SortOrder;
}

