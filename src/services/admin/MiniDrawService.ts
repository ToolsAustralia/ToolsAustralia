/**
 * MiniDrawService — shared business logic for the admin /api/admin/mini-draw/*
 * read endpoints and the corresponding Norm /v1/mini-draw/* read projections.
 *
 * Each function is framework-agnostic (no Request / NextResponse). They take
 * plain arguments and return plain data — the route handlers parse query
 * params, validate, then delegate here so the admin and Norm projections
 * share the same numbers by construction.
 *
 * The MiniDraw model uses status enum `{active | completed | cancelled}` and
 * stores a flat per-user `entries` array (with `entriesBySource` keyed by
 * `mini-draw-package | free-entry | bonus-entry-promo`). The Norm projection
 * for the export endpoint is **aggregate-only** — the admin CSV/Excel route
 * keeps full PII per legal/operational requirement, but Norm receives only
 * counts and per-state aggregate breakdowns.
 */

import connectDB from "@/lib/mongodb";
import mongoose, { Types } from "mongoose";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import User from "@/models/User";
import Winner, { type IWinner } from "@/models/Winner";

// ─────────────────────────────────────────────────────────────────────────────
// full-capacity-count
// ─────────────────────────────────────────────────────────────────────────────

export interface MiniDrawFullCapacityCountResult {
  count: number;
}

export async function getMiniDrawFullCapacityCount(): Promise<MiniDrawFullCapacityCountResult> {
  await connectDB();
  const count = await MiniDraw.countDocuments({ status: "completed" });
  return { count };
}

// ─────────────────────────────────────────────────────────────────────────────
// list
// ─────────────────────────────────────────────────────────────────────────────

export interface MiniDrawListQuery {
  status?: "active" | "completed" | "cancelled";
  search?: string;
  page: number;
  limit: number;
  sortBy: "displayOrder" | "createdAt" | "name" | "totalEntries" | "minimumEntries";
  sortOrder: "asc" | "desc";
}

export interface MiniDrawListItem {
  _id: string;
  name: string;
  description: string;
  brandId: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
  };
  displayOrder: number;
  isActive: boolean;
  status: "active" | "completed" | "cancelled";
  configurationLocked: boolean;
  lockedAt: string | null;
  fullCapacityNotificationSentAt: string | null;
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining: number;
  cycle: number;
  createdAt: string;
  updatedAt: string;
  latestWinner: {
    _id: string;
    userId: string;
    entryNumber: number;
    selectedDate: string;
    imageUrl: string | null;
    drawResultUrl: string | null;
    cycle: number;
  } | null;
}

export interface MiniDrawListResult {
  miniDraws: MiniDrawListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listMiniDraws(query: MiniDrawListQuery): Promise<MiniDrawListResult> {
  await connectDB();

  const { status, search, page, limit, sortBy, sortOrder } = query;

  const filter: mongoose.FilterQuery<typeof MiniDraw> = {};
  if (status) filter.status = status;
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

  const sort: Record<string, 1 | -1> = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;
  if (sortBy !== "displayOrder") {
    sort.displayOrder = 1;
  }

  const [miniDrawsRaw, total] = await Promise.all([
    MiniDraw.find(filter)
      .select("-entries -winner -__v")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    MiniDraw.countDocuments(filter),
  ]);

  const miniDraws: MiniDrawListItem[] = await Promise.all(
    miniDrawsRaw.map(async (draw) => {
      const entriesRemaining = Math.max(
        (draw.minimumEntries || 0) - (draw.totalEntries || 0),
        0,
      );
      let latestWinner: MiniDrawListItem["latestWinner"] = null;
      if (draw.latestWinnerId) {
        const winnerDoc = await Winner.findById(
          draw.latestWinnerId as Types.ObjectId,
        ).lean<IWinner | null>();
        if (winnerDoc) {
          const winner = winnerDoc as unknown as IWinner & { _id: Types.ObjectId };
          latestWinner = {
            _id: winner._id.toString(),
            userId: winner.userId.toString(),
            entryNumber: winner.entryNumber ?? 0,
            selectedDate: new Date(winner.selectedDate).toISOString(),
            imageUrl: winner.imageUrl ?? null,
            drawResultUrl: winner.drawResultUrl ?? null,
            cycle: winner.cycle,
          };
        }
      }

      const drawId = (draw._id as Types.ObjectId).toString();
      return {
        _id: drawId,
        name: draw.name,
        description: draw.description,
        brandId: draw.brandId,
        prize: {
          name: draw.prize?.name ?? "",
          description: draw.prize?.description ?? "",
          value: draw.prize?.value ?? 0,
          images: draw.prize?.images ?? [],
          category: draw.prize?.category ?? "",
        },
        displayOrder: draw.displayOrder ?? 0,
        isActive: draw.isActive ?? false,
        status: draw.status,
        configurationLocked: !!draw.configurationLocked,
        lockedAt: draw.lockedAt ? new Date(draw.lockedAt).toISOString() : null,
        fullCapacityNotificationSentAt: draw.fullCapacityNotificationSentAt
          ? new Date(draw.fullCapacityNotificationSentAt).toISOString()
          : null,
        totalEntries: draw.totalEntries ?? 0,
        minimumEntries: draw.minimumEntries ?? 0,
        entriesRemaining,
        cycle: draw.cycle ?? 1,
        createdAt: new Date(draw.createdAt).toISOString(),
        updatedAt: new Date(draw.updatedAt).toISOString(),
        latestWinner,
      };
    }),
  );

  const totalPages = Math.ceil(total / limit);

  return {
    miniDraws,
    pagination: { page, limit, total, totalPages },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// get — single draw detail (entries / winner arrays excluded)
// ─────────────────────────────────────────────────────────────────────────────

export interface MiniDrawDetailResult {
  _id: string;
  name: string;
  description: string;
  brandId: string;
  status: "active" | "completed" | "cancelled";
  cycle: number;
  latestWinnerId: string | null;
  winnerHistory: string[];
  configurationLocked: boolean;
  lockedAt: string | null;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
  };
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining: number;
  createdAt: string;
  updatedAt: string;
}

export type MiniDrawDetailOutcome =
  | { ok: true; data: MiniDrawDetailResult }
  | { ok: false; code: "not_found" | "bad_id" };

export async function getMiniDrawDetail(
  miniDrawId: string,
): Promise<MiniDrawDetailOutcome> {
  await connectDB();
  if (!Types.ObjectId.isValid(miniDrawId)) return { ok: false, code: "bad_id" };

  const miniDraw = (await MiniDraw.findById(miniDrawId)
    .select("-entries -winner -__v")
    .lean()) as IMiniDraw | null;

  if (!miniDraw) return { ok: false, code: "not_found" };

  const drawId = (miniDraw._id as Types.ObjectId).toString();

  return {
    ok: true,
    data: {
      _id: drawId,
      name: miniDraw.name,
      description: miniDraw.description,
      brandId: miniDraw.brandId,
      status: miniDraw.status,
      cycle: miniDraw.cycle ?? 1,
      latestWinnerId: miniDraw.latestWinnerId
        ? miniDraw.latestWinnerId.toString()
        : null,
      winnerHistory: (miniDraw.winnerHistory || []).map((w) => w.toString()),
      configurationLocked: !!miniDraw.configurationLocked,
      lockedAt: miniDraw.lockedAt ? new Date(miniDraw.lockedAt).toISOString() : null,
      prize: {
        name: miniDraw.prize?.name ?? "",
        description: miniDraw.prize?.description ?? "",
        value: miniDraw.prize?.value ?? 0,
        images: miniDraw.prize?.images ?? [],
        category: miniDraw.prize?.category ?? "",
      },
      totalEntries: miniDraw.totalEntries ?? 0,
      minimumEntries: miniDraw.minimumEntries ?? 0,
      entriesRemaining: Math.max(
        (miniDraw.minimumEntries || 0) - (miniDraw.totalEntries || 0),
        0,
      ),
      createdAt: new Date(miniDraw.createdAt).toISOString(),
      updatedAt: new Date(miniDraw.updatedAt).toISOString(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// export — aggregate-only projection (Norm intentionally does NOT receive
// per-user PII export rows — the admin route returns CSV/Excel with full PII
// for legal/operational reasons, but Norm reads an aggregate breakdown so it
// can answer "how many entries per state" etc. without per-user PII).
// ─────────────────────────────────────────────────────────────────────────────

const MINI_DRAW_STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

export interface MiniDrawStateBreakdownItem {
  state: string; // AU state full name (e.g. "Victoria"); raw abbreviation if unknown; "" if blank on user record
  participants: number;
  entries: number;
}

export interface MiniDrawExportAggregateResult {
  miniDraw: {
    _id: string;
    name: string;
    status: "active" | "completed" | "cancelled";
    totalEntries: number;
    minimumEntries: number;
    entriesRemaining: number;
    cycle: number;
  };
  participants: {
    total: number; // distinct participants resolved (users still exist)
    totalEntries: number; // sum of totalEntries across those participants
    stateBreakdown: MiniDrawStateBreakdownItem[];
  };
  missingUsers: number; // count of entry rows whose User no longer exists
}

export type MiniDrawExportAggregateOutcome =
  | { ok: true; data: MiniDrawExportAggregateResult }
  | { ok: false; code: "not_found" | "bad_id" };

export async function getMiniDrawExportAggregate(
  miniDrawId: string,
): Promise<MiniDrawExportAggregateOutcome> {
  await connectDB();
  if (!Types.ObjectId.isValid(miniDrawId)) return { ok: false, code: "bad_id" };

  const miniDraw = await MiniDraw.findById(miniDrawId);
  if (!miniDraw) return { ok: false, code: "not_found" };

  const userIds = miniDraw.entries.map(
    (entry: { userId: Types.ObjectId }) => entry.userId,
  );
  const existingUsers = await User.find({ _id: { $in: userIds } })
    .select("state")
    .lean();

  const userMap = new Map(
    existingUsers.map((u) => [(u._id as unknown as Types.ObjectId).toString(), u]),
  );

  let totalParticipants = 0;
  let totalEntries = 0;
  let missingUsers = 0;
  const stateMap = new Map<string, { participants: number; entries: number }>();

  for (const entry of miniDraw.entries as Array<{
    userId: Types.ObjectId;
    totalEntries: number;
  }>) {
    const user = userMap.get(entry.userId.toString());
    if (!user) {
      missingUsers += 1;
      continue;
    }
    totalParticipants += 1;
    totalEntries += entry.totalEntries || 0;

    const stateAbbr = ((user.state as string | undefined) || "").toUpperCase().trim();
    const stateLabel = MINI_DRAW_STATE_NAMES[stateAbbr] || (user.state as string) || "";
    const bucket = stateMap.get(stateLabel) || { participants: 0, entries: 0 };
    bucket.participants += 1;
    bucket.entries += entry.totalEntries || 0;
    stateMap.set(stateLabel, bucket);
  }

  const stateBreakdown: MiniDrawStateBreakdownItem[] = Array.from(stateMap.entries())
    .map(([state, v]) => ({ state, participants: v.participants, entries: v.entries }))
    .sort((a, b) => b.entries - a.entries);

  return {
    ok: true,
    data: {
      miniDraw: {
        _id: String(miniDraw._id),
        name: miniDraw.name,
        status: miniDraw.status,
        totalEntries: miniDraw.totalEntries ?? 0,
        minimumEntries: miniDraw.minimumEntries ?? 0,
        entriesRemaining: Math.max(
          (miniDraw.minimumEntries || 0) - (miniDraw.totalEntries || 0),
          0,
        ),
        cycle: miniDraw.cycle ?? 1,
      },
      participants: {
        total: totalParticipants,
        totalEntries,
        stateBreakdown,
      },
      missingUsers,
    },
  };
}
