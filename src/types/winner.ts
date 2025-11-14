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
  entryNumber: number;
  selectedDate: string;
  imageUrl?: string;
  selectedBy?: string;
  cycle: number;
}
