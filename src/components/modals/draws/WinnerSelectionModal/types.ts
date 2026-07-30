export interface UserSearchResult {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  currentDrawEntries?: {
    totalEntries: number;
    entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
    };
  };
}

export type WinnerSelectionDrawType = "mini" | "major";

export interface WinnerSelectionData {
  drawId: string;
  drawType: WinnerSelectionDrawType;
  winnerUserId: string;
  imageUrl?: string;
  testimony?: string;
  selectedPrize?: string;
  /** Public draw verification URL; null clears on major draw re-record */
  drawResultUrl?: string | null;
}
