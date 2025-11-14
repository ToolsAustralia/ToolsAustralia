import { IMiniDraw } from "@/models/MiniDraw";

export interface MiniDrawType
  extends Omit<
    IMiniDraw,
    "_id" | "minimumEntries" | "entriesRemaining" | "cycle" | "latestWinnerId" | "winnerHistory"
  > {
  _id: string;
  minimumEntries: number; // Required minimum entries - when reached, draw auto-closes
  entriesRemaining?: number;
  cycle: number;
  latestWinnerId?: string;
  winnerHistory?: string[];
}

// Extended type for mini draw with all new fields for frontend use
export type MiniDrawWithStatus = MiniDrawType;

// Simplified prize structure (no specifications, delivery, terms)
export interface Prize {
  name: string;
  description: string;
  value: number;
  images: string[];
  category: string;
}

// Entry-based structure (replaces ticket-based)
export interface MiniDrawEntry {
  entryNumber: number;
  userId: string;
  addedDate: Date;
  source: "mini-draw-package" | "free-entry";
  packageId?: string;
  packageName?: string;
}

export interface UserMiniDrawStats {
  totalEntries: number;
  entriesByPackage: Array<{
    packageName: string;
    packageId: string;
    entryCount: number;
    source: "mini-draw-package" | "free-entry";
  }>;
}

export interface MiniDrawSummary {
  miniDraw: MiniDrawType;
  userStats: UserMiniDrawStats | null;
  totalEntries: number;
  entriesRemaining: number;
  status: "active" | "completed" | "cancelled";
}

// Admin types for MiniDraw creation
export interface CreateMiniDrawData {
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
  };
  status?: "active" | "cancelled"; // Initial status (defaults to "active")
  minimumEntries: number; // Required minimum entries - when reached, draw auto-closes
}

export interface UpdateMiniDrawData {
  name?: string;
  description?: string;
  status?: "active" | "completed" | "cancelled";
  minimumEntries?: number; // Can be updated, but required on creation
  prize?: {
    name?: string;
    description?: string;
    value?: number;
    images?: string[];
    category?: string;
  };
}

export interface AddEntryToMiniDrawData {
  userId: string;
  source: "mini-draw-package" | "free-entry";
  packageId?: string;
  packageName?: string;
  entryCount: number;
}

export interface MiniDrawData {
  miniDraw: MiniDrawType;
  userStats: UserMiniDrawStats | null;
  totalEntries: number;
  entriesRemaining: number;
  status: "active" | "completed" | "cancelled";
}

// Export configuration data for admin
export interface MiniDrawExportData {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  state: string;
  totalEntries: number;
}

// Winner selection data
export interface SelectWinnerData {
  miniDrawId: string;
  winnerUserId: string;
  entryNumber: number;
  selectionMethod: "manual" | "government-app";
  selectedBy: string; // Admin user ID
  imageUrl?: string;
}

// Search and filter types
export interface MiniDrawSearchParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: "active" | "upcoming" | "completed";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface MiniDrawSearchResult {
  miniDraws: MiniDrawType[];
  total: number;
  page: number;
  totalPages: number;
}

export interface MiniDrawPurchaseResponse {
  success: boolean;
  message: string;
  entriesAdded?: number;
  error?: string;
}

export interface MiniDrawUserContext {
  isAuthenticated: boolean;
  hasDefaultPayment: boolean;
  isMember: boolean;
  hasActiveSubscription: boolean;
  hasOneTimePackages: boolean;
  userId?: string;
}
