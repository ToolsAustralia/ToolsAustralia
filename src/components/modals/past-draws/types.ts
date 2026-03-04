export interface CompletedDrawPrize {
  name?: string;
  description?: string;
  value?: number;
  images?: string[];
  brand?: string;
}

export interface CompletedDrawWinner {
  name: string;
  state?: string;
  entryNumber?: number;
  selectedDate?: string;
  imageUrl?: string;
}

export interface PastDrawWithUserEntries {
  _id: string;
  name: string;
  description?: string;
  prize?: CompletedDrawPrize;
  drawDate: string;
  totalEntries: number;
  participantCount: number;
  winner?: CompletedDrawWinner;
  userEntryCount: number;
}
