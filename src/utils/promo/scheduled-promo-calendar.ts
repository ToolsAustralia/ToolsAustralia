/**
 * Pure helpers for admin "calendar month" scheduling of promos.
 * Civil dates use Australia/Sydney (AEST/AEDT) via createAESTDateAsUTC.
 */

import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type { ScheduledPromo, ScheduledPromoMultiplier } from "@/types/admin";

const SYDNEY_TZ = "Australia/Sydney";

export type AestDateKey = string;

export type ScheduledPromoCalendarCell = {
  dateKey: AestDateKey;
  year: number;
  month: number;
  day: number;
};

/** null = intentional gap (falls through to toggle / alternating for that day). */
export type CalendarPaintValue = ScheduledPromoMultiplier | null;

export type ScheduledPromoCalendarDay = { dateKey: AestDateKey; multiplier: CalendarPaintValue };

/** One DB row after merging consecutive days with the same multiplier. */
export type PromoCalendarSegment = {
  multiplier: ScheduledPromoMultiplier;
  startDate: Date;
  endDate: Date;
};

const ISO_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toAestDateKeyUTC(instant: Date): AestDateKey {
  return formatInTimeZone(instant, SYDNEY_TZ, "yyyy-MM-dd");
}

export function parseAestDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const m = dateKey.match(ISO_KEY);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const start = createAESTDateAsUTC(year, month, day, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  const roundTrip = toAestDateKeyUTC(start);
  if (roundTrip !== dateKey) return null;
  return { year, month, day };
}

/**
 * Inclusive range for resolver checks: [rangeStartUTC, rangeEndUTC].
 * rangeEndUTC is last moment of the last civil day of the month in Sydney.
 */
export function getAestMonthInclusiveRangeUTC(year: number, month: number): {
  rangeStartUTC: Date;
  rangeEndUTC: Date;
} {
  const rangeStartUTC = createAESTDateAsUTC(year, month, 1, 0, 0);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthAfterStart = createAESTDateAsUTC(nextMonthYear, nextMonth, 1, 0, 0);
  const rangeEndUTC = new Date(monthAfterStart.getTime() - 1);
  return { rangeStartUTC, rangeEndUTC };
}

/** Start/end UTC instants for one Sydney calendar day (inclusive end for the same civil day). */
export function getAestDayInclusiveRangeUTC(year: number, month: number, day: number): {
  startUTC: Date;
  endUTC: Date;
} {
  const startUTC = createAESTDateAsUTC(year, month, day, 0, 0);
  const y = year;
  const m = month;
  const d = day;
  const nextDay = d + 1;
  let ny = y;
  let nm = m;
  let nd = nextDay;
  const dim = daysInHumanMonth1To12(y, m);
  if (nd > dim) {
    nd = 1;
    nm = m + 1;
    if (nm > 12) {
      nm = 1;
      ny = y + 1;
    }
  }
  const nextStart = createAESTDateAsUTC(ny, nm, nd, 0, 0);
  const endUTC = new Date(nextStart.getTime() - 1);
  return { startUTC, endUTC };
}

/** Human month 1–12; uses JS Date rollover (same as existing admin date patterns). */
function daysInHumanMonth1To12(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildMonthGrid(year: number, month: number): ScheduledPromoCalendarCell[] {
  const cells: ScheduledPromoCalendarCell[] = [];
  const daysInMonth = daysInHumanMonth1To12(year, month);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateKey, year, month, day: d });
  }
  return cells;
}

const MON_FIRST_INDEX: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

/**
 * Weeks for month view (Mon–Sun columns; padding before the 1st as nulls).
 */
export function buildMonthWeekGrid(year: number, month: number): (ScheduledPromoCalendarCell | null)[][] {
  const cells = buildMonthGrid(year, month);
  const first = createAESTDateAsUTC(year, month, 1, 0, 0);
  const weekdayName = formatInTimeZone(first, SYDNEY_TZ, "EEEE");
  const leading = MON_FIRST_INDEX[weekdayName] ?? 0;
  const slots: (ScheduledPromoCalendarCell | null)[] = Array.from({ length: leading }, () => null);
  for (const c of cells) slots.push(c);
  while (slots.length % 7 !== 0) slots.push(null);
  const rows: (ScheduledPromoCalendarCell | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) {
    rows.push(slots.slice(i, i + 7));
  }
  return rows;
}

function sortDateKeys(keys: string[]): string[] {
  return [...keys].sort();
}

/**
 * Merge consecutive civil days (sorted) that share the same multiplier into DB phases.
 */
export function mergeDayMultipliersToSegments(
  dayMap: Record<AestDateKey, ScheduledPromoMultiplier>
): PromoCalendarSegment[] {
  const keys = sortDateKeys(Object.keys(dayMap));
  if (keys.length === 0) return [];

  const segments: PromoCalendarSegment[] = [];
  let runStartKey = keys[0];
  let runMultiplier = dayMap[keys[0]];

  const flushRun = (endKey: string) => {
    const startParts = parseAestDateKey(runStartKey);
    const endParts = parseAestDateKey(endKey);
    if (!startParts || !endParts) return;
    const { startUTC } = getAestDayInclusiveRangeUTC(startParts.year, startParts.month, startParts.day);
    const { endUTC } = getAestDayInclusiveRangeUTC(endParts.year, endParts.month, endParts.day);
    if (startUTC >= endUTC) return;
    segments.push({ multiplier: runMultiplier, startDate: startUTC, endDate: endUTC });
  };

  for (let i = 1; i < keys.length; i++) {
    const key = keys[i];
    const mult = dayMap[key];
    if (mult === runMultiplier) continue;
    const prevKey = keys[i - 1];
    flushRun(prevKey);
    runStartKey = key;
    runMultiplier = mult;
  }
  flushRun(keys[keys.length - 1]);

  return segments;
}

/**
 * First instant after inclusive month end (for truncating promos that continue past the month).
 */
export function getFirstInstantAfterAestMonthUTC(year: number, month: number): Date {
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return createAESTDateAsUTC(nextMonthYear, nextMonth, 1, 0, 0);
}

export type ScheduledPromoDayLookup = Pick<ScheduledPromo, "startDate" | "endDate" | "multiplier" | "createdAt">;

/**
 * Matches DB resolution: overlapping phases for the civil day, newest `createdAt` wins.
 */
export function resolveMultiplierForAestDayFromPromos(
  promos: ScheduledPromoDayLookup[],
  year: number,
  month: number,
  day: number
): CalendarPaintValue {
  const { startUTC, endUTC } = getAestDayInclusiveRangeUTC(year, month, day);
  const startMs = startUTC.getTime();
  const endMs = endUTC.getTime();
  const overlapping = promos.filter((p) => {
    const s = new Date(p.startDate).getTime();
    const e = new Date(p.endDate).getTime();
    return s <= endMs && e >= startMs;
  });
  if (overlapping.length === 0) return null;
  overlapping.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return overlapping[0].multiplier;
}

export function buildPaintedDaysForMonthFromPromos(
  year: number,
  month: number,
  promos: ScheduledPromoDayLookup[]
): ScheduledPromoCalendarDay[] {
  const cells = buildMonthGrid(year, month);
  return cells.map((cell) => ({
    dateKey: cell.dateKey,
    multiplier: resolveMultiplierForAestDayFromPromos(promos, cell.year, cell.month, cell.day),
  }));
}
