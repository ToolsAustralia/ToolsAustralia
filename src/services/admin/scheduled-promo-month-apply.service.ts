/**
 * Applies an admin "paint the month" calendar to ScheduledPromo documents.
 * Reconciles existing phases that overlap the month (truncate / split / soft-delete) then inserts merged segments.
 */

import mongoose from "mongoose";
import ScheduledPromo from "@/models/ScheduledPromo";
import type { ScheduledPromoType } from "@/models/ScheduledPromo";
import type { ScheduledPromoMultiplier } from "@/types/admin";
import {
  buildMonthGrid,
  getAestMonthInclusiveRangeUTC,
  getFirstInstantAfterAestMonthUTC,
  mergeDayMultipliersToSegments,
  type AestDateKey,
  type CalendarPaintValue,
  type ScheduledPromoCalendarDay,
} from "@/utils/promo/scheduled-promo-calendar";

export type ApplyScheduledPromoMonthInput = {
  type: ScheduledPromoType;
  year: number;
  month: number;
  days: ScheduledPromoCalendarDay[];
  createdBy: mongoose.Types.ObjectId;
  name?: string;
  description?: string;
};

export type ApplyScheduledPromoMonthResult = {
  /** New documents inserted */
  createdPromoIds: string[];
  /** Soft-deleted (fully inside month) */
  softDeletedCount: number;
  /** Truncated or split (still active, boundary adjusted) */
  adjustedCount: number;
};

function paintMapFromDays(days: ScheduledPromoCalendarDay[]): Record<AestDateKey, CalendarPaintValue> {
  const map: Record<AestDateKey, CalendarPaintValue> = {};
  for (const { dateKey, multiplier } of days) {
    map[dateKey] = multiplier;
  }
  return map;
}

export function validateFullMonthDayGrid(
  year: number,
  month: number,
  days: ScheduledPromoCalendarDay[]
): { ok: true } | { ok: false; error: string } {
  const expected = buildMonthGrid(year, month);
  if (days.length !== expected.length) {
    return { ok: false, error: `Expected ${expected.length} day rows for this month, received ${days.length}.` };
  }
  const byKey = new Map(days.map((d) => [d.dateKey, d.multiplier]));
  for (const cell of expected) {
    if (!byKey.has(cell.dateKey)) {
      return { ok: false, error: `Missing calendar day ${cell.dateKey}.` };
    }
  }
  for (const k of byKey.keys()) {
    if (!expected.some((c) => c.dateKey === k)) {
      return { ok: false, error: `Unexpected date key ${k} for this month.` };
    }
  }
  return { ok: true };
}

async function reconcileOverlappingPromos(
  type: ScheduledPromoType,
  rangeStart: Date,
  rangeEnd: Date,
  firstInstantAfterMonth: Date
): Promise<{ softDeleted: number; adjusted: number }> {
  const overlapFilter = {
    type,
    isActive: true,
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    startDate: { $lte: rangeEnd },
    endDate: { $gte: rangeStart },
  };

  const promos = await ScheduledPromo.find(overlapFilter).sort({ startDate: 1 }).exec();

  let softDeleted = 0;
  let adjusted = 0;

  for (const promo of promos) {
    const s = promo.startDate.getTime();
    const e = promo.endDate.getTime();
    const rs = rangeStart.getTime();
    const re = rangeEnd.getTime();

    if (e < rs || s > re) continue;

    const startsBefore = s < rs;
    const endsAfter = e > re;
    const startsInsideOrAt = s >= rs && s <= re;
    const endsInsideOrAt = e >= rs && e <= re;

    if (startsInsideOrAt && endsInsideOrAt) {
      promo.isActive = false;
      promo.deletedAt = new Date();
      await promo.save();
      softDeleted += 1;
      continue;
    }

    if (startsBefore && !endsAfter) {
      const newEnd = new Date(rs - 1);
      if (newEnd <= promo.startDate) {
        promo.isActive = false;
        promo.deletedAt = new Date();
        await promo.save();
        softDeleted += 1;
      } else {
        promo.endDate = newEnd;
        await promo.save();
        adjusted += 1;
      }
      continue;
    }

    if (!startsBefore && endsAfter && startsInsideOrAt) {
      promo.startDate = firstInstantAfterMonth;
      if (promo.startDate >= promo.endDate) {
        promo.isActive = false;
        promo.deletedAt = new Date();
        await promo.save();
        softDeleted += 1;
      } else {
        await promo.save();
        adjusted += 1;
      }
      continue;
    }

    if (startsBefore && endsAfter) {
      const tailStart = firstInstantAfterMonth;
      const tailEnd = promo.endDate;
      const newEnd = new Date(rs - 1);

      promo.endDate = newEnd;
      if (newEnd <= promo.startDate) {
        promo.isActive = false;
        promo.deletedAt = new Date();
        await promo.save();
        softDeleted += 1;
      } else {
        await promo.save();
        adjusted += 1;
      }

      if (tailStart < tailEnd) {
        await ScheduledPromo.create({
          type: promo.type,
          multiplier: promo.multiplier,
          startDate: tailStart,
          endDate: tailEnd,
          isActive: true,
          createdBy: promo.createdBy,
          name: promo.name,
          description: promo.description,
        });
        adjusted += 1;
      }
      continue;
    }
  }

  return { softDeleted, adjusted };
}

export async function applyScheduledPromoMonthCalendar(
  input: ApplyScheduledPromoMonthInput
): Promise<ApplyScheduledPromoMonthResult> {
  const { type, year, month, days, createdBy, name, description } = input;

  const validated = validateFullMonthDayGrid(year, month, days);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const paint = paintMapFromDays(days);
  const dayMap: Record<AestDateKey, ScheduledPromoMultiplier> = {};
  for (const [k, v] of Object.entries(paint)) {
    if (v !== null) dayMap[k] = v;
  }

  const { rangeStartUTC, rangeEndUTC } = getAestMonthInclusiveRangeUTC(year, month);
  const firstAfter = getFirstInstantAfterAestMonthUTC(year, month);

  const { softDeleted, adjusted } = await reconcileOverlappingPromos(
    type,
    rangeStartUTC,
    rangeEndUTC,
    firstAfter
  );

  const segments = mergeDayMultipliersToSegments(dayMap);
  const createdPromoIds: string[] = [];

  for (const seg of segments) {
    const doc = await ScheduledPromo.create({
      type,
      multiplier: seg.multiplier,
      startDate: seg.startDate,
      endDate: seg.endDate,
      isActive: true,
      createdBy,
      name: name || undefined,
      description: description || undefined,
    });
    createdPromoIds.push(String(doc._id));
  }

  return {
    createdPromoIds,
    softDeletedCount: softDeleted,
    adjustedCount: adjusted,
  };
}
