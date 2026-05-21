/**
 * MajorDrawService — shared business logic for the admin /api/admin/major-draw/*
 * read endpoints and the corresponding Norm /v1/major-draw/* read projections.
 *
 * Each function is framework-agnostic (no Request / NextResponse). They take
 * plain arguments and return plain data — the route handlers parse query
 * params, validate, then delegate here so the admin and Norm projections
 * share the same numbers by construction.
 *
 * NOTE on the MajorDraw schema: the model uses `activationDate` (start) and
 * `drawDate` (end). Status enum is `{queued | active | frozen | completed |
 * cancelled}`. There is no `startDate` / `endDate` on the schema (some older
 * admin code paths typed them in by mistake). See `src/models/MajorDraw.ts`.
 */

import connectDB from "@/lib/mongodb";
import mongoose, { Types } from "mongoose";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import User from "@/models/User";
import Winner from "@/models/Winner";
import { getCurrentMajorDrawForDisplay } from "@/utils/draws/major-draw-helpers";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

// Per terms (5.4 Repeat Winner Restriction): First Prize Winners cannot win
// another major giveaway for 10 months from date of win.
const WINNER_EXCLUSION_MONTHS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// current-and-last
// ─────────────────────────────────────────────────────────────────────────────

export interface CurrentAndLastDrawRange {
  activationDate: string; // AEST YYYY-MM-DD
  drawDate: string;       // AEST YYYY-MM-DD
  name: string;
}

export interface CurrentAndLastDrawResult {
  currentDraw: CurrentAndLastDrawRange | null;
  lastDraw: CurrentAndLastDrawRange | null;
}

function formatAESTDate(date: Date | undefined | null): string | null {
  if (!date) return null;
  return formatInTimeZone(new Date(date), AEST_TIMEZONE, "yyyy-MM-dd");
}

export async function getCurrentAndLastDrawRanges(): Promise<CurrentAndLastDrawResult> {
  await connectDB();

  const currentDraw = await getCurrentMajorDrawForDisplay(true);

  type LastDrawShape = Pick<IMajorDraw, "activationDate" | "drawDate" | "name">;
  let lastDraw: LastDrawShape | null = null;
  if (currentDraw?.activationDate) {
    lastDraw = (await MajorDraw.findOne({
      status: "completed",
      drawDate: { $lt: currentDraw.activationDate },
    })
      .sort({ drawDate: -1 })
      .select("activationDate drawDate name")
      .lean()) as LastDrawShape | null;
  } else {
    lastDraw = (await MajorDraw.findOne({ status: "completed" })
      .sort({ drawDate: -1 })
      .select("activationDate drawDate name")
      .lean()) as LastDrawShape | null;
  }

  let currentDrawStartDate: string | null = null;
  let currentDrawEndDate: string | null = null;
  let lastDrawStartDate: string | null = null;
  let lastDrawEndDate: string | null = null;

  if (currentDraw?.drawDate) {
    if (lastDraw?.drawDate) {
      const lastDrawEndYear = parseInt(formatInTimeZone(lastDraw.drawDate, AEST_TIMEZONE, "yyyy"), 10);
      const lastDrawEndMonth = parseInt(formatInTimeZone(lastDraw.drawDate, AEST_TIMEZONE, "M"), 10);
      const lastDrawEndDay = parseInt(formatInTimeZone(lastDraw.drawDate, AEST_TIMEZONE, "d"), 10);
      const lastDrawEndDateAEST = createAESTDateAsUTC(lastDrawEndYear, lastDrawEndMonth, lastDrawEndDay, 0, 0);
      const currentDrawStart = addDays(lastDrawEndDateAEST, 1);
      currentDrawStartDate = formatInTimeZone(currentDrawStart, AEST_TIMEZONE, "yyyy-MM-dd");
    } else {
      currentDrawStartDate = formatAESTDate(currentDraw.activationDate);
    }
    currentDrawEndDate = formatAESTDate(currentDraw.drawDate);
  }

  if (lastDraw?.activationDate && lastDraw?.drawDate) {
    lastDrawStartDate = formatAESTDate(lastDraw.activationDate);
    lastDrawEndDate = formatAESTDate(lastDraw.drawDate);
  }

  return {
    currentDraw:
      currentDraw && currentDrawStartDate && currentDrawEndDate
        ? {
            activationDate: currentDrawStartDate,
            drawDate: currentDrawEndDate,
            name: currentDraw.name,
          }
        : null,
    lastDraw:
      lastDraw && lastDrawStartDate && lastDrawEndDate
        ? {
            activationDate: lastDrawStartDate,
            drawDate: lastDrawEndDate,
            name: lastDraw.name,
          }
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// scheduled-months
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduledDrawListItem {
  id: string;
  name: string;
  drawDate: string; // ISO 8601 UTC
  status: "queued" | "active" | "frozen" | "completed";
}

export interface ScheduledRestrictedMonth {
  year: number;
  month: number;        // 0-based, 0 = January
  monthName: string;    // English long month name
}

export interface ScheduledMonthsResult {
  restrictedMonths: ScheduledRestrictedMonth[];
  scheduledDraws: ScheduledDrawListItem[];
}

export async function getScheduledDrawMonths(): Promise<ScheduledMonthsResult> {
  await connectDB();

  const scheduledDraws = await MajorDraw.find({
    drawDate: { $exists: true, $ne: null },
    status: { $in: ["queued", "active", "frozen", "completed"] },
  }).select("drawDate name status");

  const monthSet = new Set<string>();
  for (const draw of scheduledDraws) {
    if (draw.drawDate) {
      const date = new Date(draw.drawDate);
      monthSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    }
  }

  const restrictedMonths: ScheduledRestrictedMonth[] = Array.from(monthSet).map((monthKey) => {
    const [yearStr, monthStr] = monthKey.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    return {
      year,
      month,
      monthName: new Date(year, month, 1).toLocaleDateString("en-US", { month: "long" }),
    };
  });

  return {
    restrictedMonths,
    scheduledDraws: scheduledDraws.map((draw) => ({
      id: String(draw._id),
      name: draw.name,
      drawDate: new Date(draw.drawDate).toISOString(),
      status: draw.status as ScheduledDrawListItem["status"],
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// history
// ─────────────────────────────────────────────────────────────────────────────

export interface MajorDrawHistoryQuery {
  status?: "queued" | "active" | "frozen" | "completed" | "cancelled";
  hasWinner?: "true" | "false";
  search?: string;
  page: number;
  limit: number;
  sortBy: "drawDate" | "createdAt" | "name" | "prize.value";
  sortOrder: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
}

export interface MajorDrawHistoryItem {
  _id: string;
  name: string;
  description: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  drawDate: string;        // ISO 8601 UTC
  activationDate: string;  // ISO 8601 UTC
  freezeEntriesAt: string; // ISO 8601 UTC
  configurationLocked: boolean;
  lockedAt: string | null;
  prize: {
    name: string | null;
    description: string | null;
    value: number | null;
    brand: string | null;
  } | null;
  totalEntries: number;
  hasWinner: boolean;
  winner: {
    winnerId: string;
    userId: string;
    selectedDate: string;       // ISO 8601 UTC
    selectionMethod: "manual" | "government-app" | null;
    selectedPrize: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MajorDrawHistoryResult {
  draws: MajorDrawHistoryItem[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
  };
  stats: {
    totalDraws: number;
    totalEntries: number;
    totalPrizeValue: number;
    drawsWithWinners: number;
    drawsWithoutWinners: number;
    winnerSelectionRate: number; // percent integer 0–100
  };
}

type MajorDrawHistoryLean = {
  _id: Types.ObjectId | string;
  name: string;
  description: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  drawDate: Date;
  activationDate: Date;
  freezeEntriesAt: Date;
  configurationLocked: boolean;
  lockedAt?: Date;
  prize?: {
    name?: string;
    description?: string;
    value?: number;
    brand?: string;
  };
  totalEntries: number;
  createdAt: Date;
  updatedAt: Date;
};

type WinnerLeanForHistory = {
  _id: Types.ObjectId | string;
  drawId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  selectedDate: Date;
  selectionMethod?: "manual" | "government-app";
  selectedPrize?: string;
  selectedPrizeSlug?: string;
};

export async function getMajorDrawHistory(
  query: MajorDrawHistoryQuery,
): Promise<MajorDrawHistoryResult> {
  await connectDB();

  const { status, hasWinner, search, page, limit, sortBy, sortOrder, dateFrom, dateTo } = query;

  const filter: mongoose.FilterQuery<typeof MajorDraw> = {};

  if (status) filter.status = status;

  if (dateFrom || dateTo) {
    filter.drawDate = {};
    if (dateFrom) filter.drawDate.$gte = new Date(dateFrom);
    if (dateTo) filter.drawDate.$lte = new Date(dateTo);
  }

  if (search) {
    const searchRegex = new RegExp(search, "i");
    filter.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { "prize.name": searchRegex },
      { "prize.description": searchRegex },
    ];
  }

  const skip = (page - 1) * limit;
  const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  const [draws, totalCount] = await Promise.all([
    MajorDraw.find(filter)
      .select("-entries -__v")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    MajorDraw.countDocuments(filter),
  ]);

  const drawIds = draws.map((d) => d._id);
  const winners = await Winner.find({
    drawId: { $in: drawIds },
    drawType: "major",
  })
    .select("_id drawId userId selectedDate selectionMethod selectedPrize selectedPrizeSlug")
    .lean();

  const winnerMap = new Map<string, WinnerLeanForHistory>();
  for (const w of winners) {
    const winnerDoc = w as unknown as WinnerLeanForHistory;
    const drawId = String(winnerDoc.drawId);
    winnerMap.set(drawId, winnerDoc);
  }

  const items: MajorDrawHistoryItem[] = [];
  for (const draw of draws as unknown as MajorDrawHistoryLean[]) {
    const drawId = String(draw._id);
    const winner = winnerMap.get(drawId);

    if (hasWinner === "true" && !winner) continue;
    if (hasWinner === "false" && winner) continue;

    items.push({
      _id: drawId,
      name: draw.name,
      description: draw.description,
      status: draw.status,
      drawDate: draw.drawDate ? new Date(draw.drawDate).toISOString() : "",
      activationDate: draw.activationDate ? new Date(draw.activationDate).toISOString() : "",
      freezeEntriesAt: draw.freezeEntriesAt ? new Date(draw.freezeEntriesAt).toISOString() : "",
      configurationLocked: !!draw.configurationLocked,
      lockedAt: draw.lockedAt ? new Date(draw.lockedAt).toISOString() : null,
      prize: draw.prize
        ? {
            name: draw.prize.name ?? null,
            description: draw.prize.description ?? null,
            value: draw.prize.value ?? null,
            brand: draw.prize.brand ?? null,
          }
        : null,
      totalEntries: draw.totalEntries ?? 0,
      hasWinner: !!winner,
      winner: winner
        ? {
            winnerId: String(winner._id),
            userId: String(winner.userId),
            selectedDate: new Date(winner.selectedDate).toISOString(),
            selectionMethod: winner.selectionMethod ?? null,
            selectedPrize: winner.selectedPrize ?? winner.selectedPrizeSlug ?? null,
          }
        : null,
      createdAt: new Date(draw.createdAt).toISOString(),
      updatedAt: new Date(draw.updatedAt).toISOString(),
    });
  }

  const totalPages = Math.ceil(totalCount / limit);

  const [drawStats, winnerCount] = await Promise.all([
    MajorDraw.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalDraws: { $sum: 1 },
          totalEntries: { $sum: "$totalEntries" },
          totalPrizeValue: { $sum: "$prize.value" },
        },
      },
    ]),
    (async () => {
      const matchingDraws = await MajorDraw.find(filter).select("_id").lean();
      const matchingDrawIds = matchingDraws.map((d) => d._id);
      return Winner.countDocuments({ drawId: { $in: matchingDrawIds }, drawType: "major" });
    })(),
  ]);

  const drawStatsResult = drawStats[0] || { totalDraws: 0, totalEntries: 0, totalPrizeValue: 0 };

  return {
    draws: items,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
    },
    stats: {
      totalDraws: drawStatsResult.totalDraws,
      totalEntries: drawStatsResult.totalEntries,
      totalPrizeValue: drawStatsResult.totalPrizeValue,
      drawsWithWinners: winnerCount,
      drawsWithoutWinners: drawStatsResult.totalDraws - winnerCount,
      winnerSelectionRate:
        drawStatsResult.totalDraws > 0
          ? Math.round((winnerCount / drawStatsResult.totalDraws) * 100)
          : 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// update.get — read-only fetch of a draw's editable fields
// ─────────────────────────────────────────────────────────────────────────────

export interface MajorDrawUpdateGetResult {
  _id: string;
  name: string;
  description: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  drawDate: string;        // ISO 8601 UTC
  activationDate: string;  // ISO 8601 UTC
  freezeEntriesAt: string; // ISO 8601 UTC
  configurationLocked: boolean;
  lockedAt: string | null;
  prize: {
    name: string | null;
    description: string | null;
    value: number | null;
    brand: string | null;
    images: string[];
    terms: string[];
  } | null;
  totalEntries: number;
  createdAt: string;
  updatedAt: string;
}

export async function getMajorDrawForUpdate(
  majorDrawId: string,
): Promise<MajorDrawUpdateGetResult | null> {
  await connectDB();
  if (!Types.ObjectId.isValid(majorDrawId)) return null;
  const draw = await MajorDraw.findById(majorDrawId).select("-entries -winner -__v");
  if (!draw) return null;
  return {
    _id: String(draw._id),
    name: draw.name,
    description: draw.description,
    status: draw.status,
    drawDate: draw.drawDate ? new Date(draw.drawDate).toISOString() : "",
    activationDate: draw.activationDate ? new Date(draw.activationDate).toISOString() : "",
    freezeEntriesAt: draw.freezeEntriesAt ? new Date(draw.freezeEntriesAt).toISOString() : "",
    configurationLocked: !!draw.configurationLocked,
    lockedAt: draw.lockedAt ? new Date(draw.lockedAt).toISOString() : null,
    prize: draw.prize
      ? {
          name: draw.prize.name ?? null,
          description: draw.prize.description ?? null,
          value: draw.prize.value ?? null,
          brand: draw.prize.brand ?? null,
          images: draw.prize.images ?? [],
          terms: draw.prize.terms ?? [],
        }
      : null,
    totalEntries: draw.totalEntries ?? 0,
    createdAt: new Date(draw.createdAt).toISOString(),
    updatedAt: new Date(draw.updatedAt).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// participants
// ─────────────────────────────────────────────────────────────────────────────

export interface MajorDrawParticipantsQuery {
  majorDrawId: string;
  page: number;
  limit: number;        // clamped to 1..100 by the route
  search?: string;
}

/**
 * PII-safe participant projection. Email, last name, and mobile are intentionally
 * NOT projected. `userId` is the opaque correlation key Norm can use to call
 * other endpoints (e.g. user-detail) if it needs richer data.
 */
export interface MajorDrawParticipantSafe {
  userId: string;
  firstName: string;
  state: string | null;
  totalEntries: number;
  entriesBySource: {
    membership: number;
    "one-time-package": number;
    upsell: number;
    "mini-draw": number;
    referral: number;
    "bonus-entry-promo": number;
    "cancellation-upsell": number;
  };
  firstAddedDate: string;   // ISO 8601 UTC
  lastUpdatedDate: string;  // ISO 8601 UTC
}

export interface MajorDrawParticipantsResult {
  majorDraw: { _id: string; name: string; totalEntries: number };
  participants: MajorDrawParticipantSafe[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export type MajorDrawParticipantsOutcome =
  | { ok: true; data: MajorDrawParticipantsResult }
  | { ok: false; code: "not_found" | "bad_id" };

type MajorDrawEntryRaw = {
  userId: Types.ObjectId | string;
  totalEntries: number;
  entriesBySource?: Partial<MajorDrawParticipantSafe["entriesBySource"]>;
  firstAddedDate: Date;
  lastUpdatedDate: Date;
};

function zeroEntriesBySource(): MajorDrawParticipantSafe["entriesBySource"] {
  return {
    membership: 0,
    "one-time-package": 0,
    upsell: 0,
    "mini-draw": 0,
    referral: 0,
    "bonus-entry-promo": 0,
    "cancellation-upsell": 0,
  };
}

export async function getMajorDrawParticipantsSafe(
  query: MajorDrawParticipantsQuery,
): Promise<MajorDrawParticipantsOutcome> {
  await connectDB();
  if (!Types.ObjectId.isValid(query.majorDrawId)) return { ok: false, code: "bad_id" };

  const majorDraw = await MajorDraw.findById(query.majorDrawId);
  if (!majorDraw) return { ok: false, code: "not_found" };

  let entries: MajorDrawEntryRaw[] = ((majorDraw.entries as unknown) as MajorDrawEntryRaw[]) || [];

  if (query.search && query.search.trim()) {
    const searchRegex = new RegExp(query.search.trim(), "i");
    const matchingUsers = await User.find({
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: query.search.trim(),
              options: "i",
            },
          },
        },
      ],
    }).select("_id");
    const matchingIds = new Set(matchingUsers.map((u) => u._id.toString()));
    entries = entries.filter((entry) => {
      if (!entry.userId) return false;
      const userId =
        typeof entry.userId === "object" && "toString" in entry.userId
          ? entry.userId.toString()
          : String(entry.userId);
      return matchingIds.has(userId);
    });
  }

  const totalCount = entries.length;
  const totalPages = Math.ceil(totalCount / query.limit);
  const skip = (query.page - 1) * query.limit;
  const paginatedEntries = entries.slice(skip, skip + query.limit);

  const userIds = paginatedEntries
    .map((entry) => entry.userId)
    .filter((id): id is Types.ObjectId | string => !!id);

  const users = await User.find({ _id: { $in: userIds } }).select("firstName state");
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const participants: MajorDrawParticipantSafe[] = paginatedEntries.map((entry) => {
    const userId =
      typeof entry.userId === "object" && "toString" in entry.userId
        ? entry.userId.toString()
        : String(entry.userId || "");
    const user = userId ? userMap.get(userId) : null;
    const ebs = entry.entriesBySource || {};
    return {
      userId: userId || "",
      firstName: user?.firstName || "",
      state: user?.state || null,
      totalEntries: entry.totalEntries || 0,
      entriesBySource: {
        ...zeroEntriesBySource(),
        ...ebs,
      },
      firstAddedDate: new Date(entry.firstAddedDate || Date.now()).toISOString(),
      lastUpdatedDate: new Date(entry.lastUpdatedDate || Date.now()).toISOString(),
    };
  });

  participants.sort((a, b) => b.totalEntries - a.totalEntries);

  return {
    ok: true,
    data: {
      majorDraw: {
        _id: String(majorDraw._id),
        name: majorDraw.name,
        totalEntries: majorDraw.totalEntries,
      },
      participants,
      pagination: {
        currentPage: query.page,
        totalPages,
        totalCount,
        limit: query.limit,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// export — aggregate-only projection (Norm intentionally does NOT receive
// per-user PII export rows — the admin route returns CSV/Excel with full PII
// for legal/operational reasons, but Norm reads an aggregate breakdown so it
// can answer "how many eligible entries in <state>" etc. without per-user PII).
// ─────────────────────────────────────────────────────────────────────────────

export interface MajorDrawExportAggregateQuery {
  majorDrawId?: string;
}

export interface StateBreakdownItem {
  state: string;          // AU state full name (e.g. "Victoria"); raw abbreviation if unknown; "" if blank on user record
  participants: number;   // count of distinct eligible users in this state
  entries: number;        // sum of totalEntries for those users
}

export interface MajorDrawExportAggregateResult {
  majorDraw: {
    _id: string;
    name: string;
    status: "queued" | "active" | "frozen" | "completed" | "cancelled";
    totalEntries: number;
    activationDate: string | null;  // ISO 8601 UTC
    drawDate: string | null;        // ISO 8601 UTC
  };
  exclusions: {
    repeatWinnersExcluded: number;        // distinct users excluded under 10-month repeat-winner rule
    ineligibleStateExcluded: number;      // distinct users excluded because state is SA or ACT
  };
  eligible: {
    participants: number;                 // count of distinct eligible users
    totalEntries: number;                 // sum of totalEntries across eligible users
    stateBreakdown: StateBreakdownItem[]; // per-state aggregate after exclusions
  };
}

export type MajorDrawExportAggregateOutcome =
  | { ok: true; data: MajorDrawExportAggregateResult }
  | { ok: false; code: "not_found" | "bad_id" | "cancelled" };

const STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

type PopulatedExportUser = {
  _id?: Types.ObjectId | string;
  state?: string;
};

export async function getMajorDrawExportAggregate(
  query: MajorDrawExportAggregateQuery,
): Promise<MajorDrawExportAggregateOutcome> {
  await connectDB();

  let majorDraw: IMajorDraw | null;
  if (query.majorDrawId) {
    if (!Types.ObjectId.isValid(query.majorDrawId)) return { ok: false, code: "bad_id" };
    majorDraw = await MajorDraw.findById(query.majorDrawId);
  } else {
    majorDraw = await MajorDraw.findOne({
      status: { $in: ["active", "frozen", "completed"] },
    }).sort({ activationDate: -1 });
  }

  if (!majorDraw) return { ok: false, code: "not_found" };
  if (majorDraw.status === "cancelled") return { ok: false, code: "cancelled" };

  // Identify recent major winners (last 10 months) — exclusion under terms 5.4.
  const tenMonthsAgo = new Date();
  tenMonthsAgo.setMonth(tenMonthsAgo.getMonth() - WINNER_EXCLUSION_MONTHS);
  const recentDraws = await MajorDraw.find({ drawDate: { $gte: tenMonthsAgo } })
    .select("_id")
    .lean();
  const recentDrawIds = recentDraws.map((d) => d._id).filter(Boolean);
  const recentMajorWinners = await Winner.find({
    drawType: "major",
    drawId: { $in: recentDrawIds },
  })
    .select("userId")
    .lean();
  const excludedUserIds = new Set(
    recentMajorWinners.map((w) => w.userId?.toString()).filter(Boolean),
  );

  // Populate user state (only the field we actually need).
  await majorDraw.populate({
    path: "entries.userId",
    select: "state",
    model: User,
  });

  let repeatWinnersExcluded = 0;
  let ineligibleStateExcluded = 0;
  let eligibleParticipants = 0;
  let eligibleEntries = 0;
  const stateMap = new Map<string, { participants: number; entries: number }>();

  for (const entry of majorDraw.entries) {
    const raw = entry.userId as unknown as PopulatedExportUser;
    const userId = raw?._id?.toString?.() ?? (typeof raw === "object" && raw && "toString" in raw ? String(raw) : "");
    if (userId && excludedUserIds.has(userId)) {
      repeatWinnersExcluded += 1;
      continue;
    }
    const stateAbbr = (raw?.state || "").toUpperCase().trim();
    if (stateAbbr === "SA" || stateAbbr === "ACT") {
      ineligibleStateExcluded += 1;
      continue;
    }
    eligibleParticipants += 1;
    eligibleEntries += entry.totalEntries || 0;
    const stateLabel = STATE_NAMES[stateAbbr] || raw?.state || "";
    const bucket = stateMap.get(stateLabel) || { participants: 0, entries: 0 };
    bucket.participants += 1;
    bucket.entries += entry.totalEntries || 0;
    stateMap.set(stateLabel, bucket);
  }

  const stateBreakdown: StateBreakdownItem[] = Array.from(stateMap.entries())
    .map(([state, v]) => ({ state, participants: v.participants, entries: v.entries }))
    .sort((a, b) => b.entries - a.entries);

  return {
    ok: true,
    data: {
      majorDraw: {
        _id: String(majorDraw._id),
        name: majorDraw.name,
        status: majorDraw.status,
        totalEntries: majorDraw.totalEntries,
        activationDate: majorDraw.activationDate ? new Date(majorDraw.activationDate).toISOString() : null,
        drawDate: majorDraw.drawDate ? new Date(majorDraw.drawDate).toISOString() : null,
      },
      exclusions: {
        repeatWinnersExcluded,
        ineligibleStateExcluded,
      },
      eligible: {
        participants: eligibleParticipants,
        totalEntries: eligibleEntries,
        stateBreakdown,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// select-winner GET — preview the current winner (if any)
// ─────────────────────────────────────────────────────────────────────────────

export interface MajorDrawWinnerPreview {
  hasWinner: boolean;
  majorDraw: {
    id: string;
    name: string;
    status: "queued" | "active" | "frozen" | "completed" | "cancelled";
    totalEntries: number;
  };
  winner: {
    userId: string;
    // PII-safe summary: only `state` is exposed. firstName/lastName/email/mobile
    // are intentionally NOT projected — Norm can call `users.get` (when wired)
    // for richer detail via the opaque userId correlation key.
    user: { state: string | null } | null;
    entryNumber: number | null;
    selectedDate: string;             // ISO 8601 UTC
    selectionMethod: "manual" | "government-app" | null;
    imageUrl: string | null;
    testimony: string | null;
    selectedPrize: string | null;
    drawResultUrl: string | null;
  } | null;
}

export type MajorDrawSelectWinnerPreviewOutcome =
  | { ok: true; data: MajorDrawWinnerPreview }
  | { ok: false; code: "not_found" | "bad_id" };

type PopulatedWinnerUser = {
  state?: string;
};

export async function getMajorDrawSelectWinnerPreview(
  majorDrawId: string,
): Promise<MajorDrawSelectWinnerPreviewOutcome> {
  await connectDB();
  if (!Types.ObjectId.isValid(majorDrawId)) return { ok: false, code: "bad_id" };

  const majorDraw = await MajorDraw.findById(majorDrawId);
  if (!majorDraw) return { ok: false, code: "not_found" };

  const winner = await Winner.findOne({
    drawId: majorDraw._id,
    drawType: "major",
  }).populate("userId", "state");

  if (!winner) {
    return {
      ok: true,
      data: {
        hasWinner: false,
        majorDraw: {
          id: String(majorDraw._id),
          name: majorDraw.name,
          status: majorDraw.status,
          totalEntries: majorDraw.totalEntries,
        },
        winner: null,
      },
    };
  }

  const populatedUser =
    typeof winner.userId === "object" && winner.userId && "state" in winner.userId
      ? (winner.userId as unknown as PopulatedWinnerUser)
      : null;
  const winnerUserId =
    typeof winner.userId === "object" && winner.userId && "_id" in winner.userId
      ? String((winner.userId as unknown as { _id: Types.ObjectId | string })._id)
      : String(winner.userId);

  return {
    ok: true,
    data: {
      hasWinner: true,
      majorDraw: {
        id: String(majorDraw._id),
        name: majorDraw.name,
        status: majorDraw.status,
        totalEntries: majorDraw.totalEntries,
      },
      winner: {
        userId: winnerUserId,
        user: populatedUser ? { state: populatedUser.state ?? null } : null,
        entryNumber: winner.entryNumber ?? null,
        selectedDate: new Date(winner.selectedDate).toISOString(),
        selectionMethod: winner.selectionMethod ?? null,
        imageUrl: winner.imageUrl ?? null,
        testimony: winner.testimony ?? null,
        selectedPrize: winner.selectedPrize ?? winner.selectedPrizeSlug ?? null,
        drawResultUrl: winner.drawResultUrl ?? null,
      },
    },
  };
}
