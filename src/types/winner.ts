export type WinnerDrawType = "mini" | "major";

export interface WinnerSummary {
  id: string;
  drawId: string;
  drawName: string;
  drawType: WinnerDrawType;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
  };
  winnerFirstName: string;
  winnerLastName: string;
  winnerState?: string;
  entryNumber?: number;
  selectedDate: string;
  /** Draw end date (e.g. drawDate for major draws) – use for "Won on" display instead of selectedDate */
  wonOnDate?: string;
  imageUrl?: string;
  selectedBy?: string;
  cycle: number;
  // Testimony from the winner (optional)
  testimony?: string;
  // Selected prize text for major draws (optional, only for major draw winners)
  // Free-form text field to allow flexibility as prize values change
  selectedPrize?: string;
  /** External verification / live draw link (e.g. randomdraws.com.au) */
  drawResultUrl?: string;
}
