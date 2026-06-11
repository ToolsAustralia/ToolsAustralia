// Presentational formatting helpers for the Draw Results page.
// All formatting is timezone- and locale-deterministic so SSR and client output
// match exactly (no hydration mismatches): UTC date parts + manual grouping.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface DateParts {
  day: string;
  mon: string;
  yr: string;
  full: string;
}

/** "2026-05-27T..." → { day:"27", mon:"May", yr:"2026", full:"27 May 2026" } */
export function auDateParts(iso?: string): DateParts {
  if (!iso) return { day: "", mon: "", yr: "", full: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "", mon: "", yr: "", full: "" };
  const day = String(d.getUTCDate());
  const mon = MONTHS[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear());
  return { day, mon, yr, full: `${day} ${mon} ${yr}` };
}

/** 18420 → "18,420" */
export function fmtNum(n: number): string {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
