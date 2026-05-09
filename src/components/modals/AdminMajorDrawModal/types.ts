export interface MajorDrawFormData {
  name: string;
  description: string;
  drawDate: string;
  activationDate: string;
  freezeEntriesAt: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: (string | File)[];
    brand: string;
    terms: string[];
    specifications: Record<string, string | number | string[]>;
  };
}

export interface RestrictedMonth {
  year: number;
  month: number;
  monthName: string;
}

export interface ScheduledDraw {
  id: string;
  name: string;
  drawDate: string;
  status: string;
}

export type FieldChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
