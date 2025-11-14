import { IMajorDraw } from "@/models/MajorDraw";

export interface MajorDrawType extends IMajorDraw {
  _id: string;
}

// Extended type for major draw with all new fields for frontend use
// Note: All fields are already in IMajorDraw, this is just an alias for clarity
export type MajorDrawWithStatus = MajorDrawType;

export interface MajorDrawEntry {
  entryNumber: number;
  userId: string;
  addedDate: Date;
  source: "membership" | "one-time-package" | "upsell" | "mini-draw";
  packageId?: string;
  packageName?: string;
}

export interface UserMajorDrawStats {
  totalEntries: number;
  membershipEntries: number;
  oneTimeEntries: number;
  entriesByPackage: Array<{
    packageName: string;
    packageId: string;
    entryCount: number;
    source: "membership" | "one-time-package" | "upsell" | "mini-draw";
  }>;
}

export interface MajorDrawSummary {
  majorDraw: MajorDrawType;
  userStats: UserMajorDrawStats;
  totalEntries: number;
  daysRemaining: number;
  isActive: boolean;
}

export interface CreateMajorDrawData {
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
    specifications?: Record<string, string | number | string[]>;
    brand?: string;
    model?: string;
    condition?: string;
    warranty?: string;
    delivery?: {
      method: string;
      timeframe: string;
      restrictions?: string;
    };
    terms?: string[];
  };
  // Required fields
  drawDate: Date; // When the draw happens (e.g., Sept 30, 8:00 PM AEST stored as UTC)
  activationDate: Date; // When draw becomes publicly visible (e.g., Oct 1, 12:00 AM AEST stored as UTC)
  freezeEntriesAt?: Date; // Auto-calculated from drawDate - 30 minutes
  status?: "queued" | "active"; // Initial status (defaults to "active")
}

export interface AddEntryToMajorDrawData {
  userId: string;
  source: "membership" | "one-time-package" | "upsell";
  packageId: string;
  packageName: string;
  entryCount: number;
}

export interface MajorDrawData {
  majorDraw: MajorDrawType;
  userStats: UserMajorDrawStats | null;
  totalEntries: number;
  daysRemaining: number;
  isActive: boolean;
  // New status fields
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  isFrozen: boolean; // Whether entries are currently frozen
  timeUntilFreeze?: number; // Milliseconds until freeze (if not frozen yet)
  timeUntilDraw?: number; // Milliseconds until draw date
}

// Export configuration data for admin
export interface MajorDrawExportData {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  state: string;
  totalEntries: number;
}

// Winner selection data
export interface SelectWinnerData {
  majorDrawId: string;
  winnerUserId: string;
  entryNumber: number;
  selectionMethod: "manual" | "government-app";
  selectedBy: string; // Admin user ID
}
