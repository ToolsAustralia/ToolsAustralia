/**
 * PromoQueryService
 *
 * Read-side service for the core Promo collection (toggle-system promos)
 * and the related promo sub-domain collections (alternating multiplier,
 * bonus-entry promo, promo link, scheduled promo). Shared between the
 * admin GET routes under `/api/admin/promo/*` and the Norm read endpoints
 * under `/api/internal/norm/v1/promo/*`. By construction the admin UI
 * and the Norm projection draw from the same code path.
 *
 * Note: the Promo "toggle system" intentionally ignores startDate/endDate for
 * activation — only `isActive` matters. The legacy time-remaining numbers are
 * preserved here as zero/false for backward compatibility with the admin shape.
 */
import connectDB from "@/lib/mongodb";
import Promo, { IPromo } from "@/models/Promo";
import AlternatingPromoMultiplier from "@/models/AlternatingPromoMultiplier";
import BonusEntryPromo from "@/models/BonusEntryPromo";
import PromoLink from "@/models/PromoLink";
import ScheduledPromo from "@/models/ScheduledPromo";

export type PromoType = "membership-packages" | "one-time-packages" | "mini-packages";

export interface ActivePromoRow {
  id: string;
  type: PromoType;
  multiplier: number;
  startDate: Date;
  endDate: Date;
  duration: number;
  isActive: boolean;
  timeRemaining: number; // always 0 in the toggle system
  isExpired: boolean;    // always false in the toggle system
  createdAt: Date;
  createdBy: unknown;    // ObjectId in admin shape — kept opaque for Norm projection
}

export interface ActivePromoListResult {
  data: ActivePromoRow[];
  count: number;
}

export interface PromoHistoryRow {
  id: string;
  type: PromoType;
  multiplier: number;
  startDate: Date | undefined;
  endDate: Date | undefined;
  duration: number | undefined;
  isActive: boolean;
  isExpired: boolean;
  timeRemaining: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface PromoHistoryResult {
  data: PromoHistoryRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface PromoHistoryParams {
  page?: number;
  limit?: number;
  type?: PromoType;
}

/**
 * List all currently-active promos in the toggle system.
 * Returns rows sorted by `createdAt` descending.
 */
export async function listActivePromos(): Promise<ActivePromoListResult> {
  await connectDB();

  const activePromos = await Promo.find({ isActive: true }).sort({ createdAt: -1 });

  const rows: ActivePromoRow[] = activePromos.map((promo: IPromo & { _id: unknown }) => ({
    id: String(promo._id),
    type: promo.type,
    multiplier: promo.multiplier,
    startDate: promo.startDate || new Date(),
    endDate: promo.endDate || new Date(),
    duration: promo.duration || 24,
    isActive: promo.isActive,
    timeRemaining: 0,
    isExpired: false,
    createdAt: promo.createdAt,
    createdBy: promo.createdBy,
  }));

  return { data: rows, count: rows.length };
}

/**
 * Paged promo-history listing across all promos (active + inactive).
 * The legacy time-remaining math is preserved for parity with the admin shape;
 * in the toggle system `endDate` is rarely meaningful, but rows that have one
 * compute `timeRemaining` / `isExpired` from it.
 */
export async function listPromoHistory(params: PromoHistoryParams): Promise<PromoHistoryResult> {
  await connectDB();

  const requestedPage = params.page ?? 1;
  const requestedLimit = params.limit ?? 10;
  const validPage = Math.max(1, requestedPage);
  const validLimit = Math.min(100, Math.max(1, requestedLimit));
  const skip = (validPage - 1) * validLimit;

  const filter: Record<string, string> = {};
  if (params.type) filter.type = params.type;

  const totalCount = await Promo.countDocuments(filter);

  const promos = await Promo.find(filter)
    .populate("createdBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(validLimit)
    .lean();

  const rows: PromoHistoryRow[] = promos.map((promo) => {
    const now = new Date();
    const endMs = promo.endDate ? new Date(promo.endDate).getTime() : 0;
    const timeRemaining = endMs ? endMs - now.getTime() : 0;
    const isExpired = endMs ? timeRemaining <= 0 : false;
    const isActive = promo.isActive && !isExpired;

    const createdBy = promo.createdBy as
      | { _id: unknown; firstName?: string; lastName?: string; email?: string }
      | null
      | undefined;

    return {
      id: String(promo._id),
      type: promo.type,
      multiplier: promo.multiplier,
      startDate: promo.startDate,
      endDate: promo.endDate,
      duration: promo.duration,
      isActive,
      isExpired,
      timeRemaining: Math.max(0, timeRemaining),
      createdAt: promo.createdAt,
      updatedAt: promo.updatedAt,
      createdBy:
        createdBy && typeof createdBy === "object" && "_id" in createdBy
          ? {
              id: String(createdBy._id),
              name: `${createdBy.firstName ?? ""} ${createdBy.lastName ?? ""}`.trim(),
              email: createdBy.email ?? "",
            }
          : null,
    };
  });

  const totalPages = Math.ceil(totalCount / validLimit);

  return {
    data: rows,
    pagination: {
      currentPage: validPage,
      totalPages,
      totalCount,
      limit: validLimit,
      hasNextPage: validPage < totalPages,
      hasPrevPage: validPage > 1,
    },
  };
}

// ─── Alternating multiplier ──────────────────────────────────────────────────

export interface AlternatingMultiplierRow {
  id: string;
  type: PromoType;
  multipliers: [number, number];
  isEnabled: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface AlternatingMultiplierListResult {
  data: AlternatingMultiplierRow[];
  count: number;
}

/**
 * List all alternating-multiplier promo configs (one per package type).
 * Optionally filter to a single type — matches the admin GET shape.
 */
export async function listAlternatingMultipliers(
  type?: PromoType,
): Promise<AlternatingMultiplierListResult> {
  await connectDB();

  type CreatedByPopulated = {
    _id: unknown;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  type ConfigDocument = {
    _id: { toString(): string } | string;
    type: PromoType;
    multipliers: number[];
    isEnabled: boolean;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: CreatedByPopulated | null;
  };

  let configs: ConfigDocument[];
  if (type) {
    const one = await AlternatingPromoMultiplier.findOne({ type })
      .populate("createdBy", "firstName lastName email")
      .lean()
      .exec();
    configs = one ? [one as unknown as ConfigDocument] : [];
  } else {
    configs = (await AlternatingPromoMultiplier.find()
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean()
      .exec()) as unknown as ConfigDocument[];
  }

  const rows: AlternatingMultiplierRow[] = configs.map((config) => {
    const id = typeof config._id === "string" ? config._id : config._id.toString();
    const multipliers: [number, number] =
      Array.isArray(config.multipliers) && config.multipliers.length === 2
        ? [config.multipliers[0], config.multipliers[1]]
        : [2, 3];

    const createdBy = config.createdBy;
    return {
      id,
      type: config.type,
      multipliers,
      isEnabled: config.isEnabled,
      description: config.description,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      createdBy:
        createdBy && typeof createdBy === "object" && "_id" in createdBy
          ? {
              id: String(createdBy._id),
              name: `${createdBy.firstName ?? ""} ${createdBy.lastName ?? ""}`.trim(),
              email: createdBy.email ?? "",
            }
          : null,
    };
  });

  return { data: rows, count: rows.length };
}

// ─── Bonus-entry promo ───────────────────────────────────────────────────────

export interface BonusEntryPromoRow {
  id: string;
  type: PromoType;
  bonusEntries: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isCurrentlyActive: boolean;
  isUpcoming: boolean;
  isExpired: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface BonusEntryPromoListParams {
  type?: PromoType;
  isActive?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface BonusEntryPromoListResult {
  data: BonusEntryPromoRow[];
  count: number;
}

/**
 * List bonus-entry promos with optional filters; the admin route exposes the
 * same filters and returns the same shape.
 */
export async function listBonusEntryPromos(
  params: BonusEntryPromoListParams,
): Promise<BonusEntryPromoListResult> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (params.type) filter.type = params.type;
  if (params.isActive !== undefined) filter.isActive = params.isActive;
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.startDate = range;
  }

  type Row = {
    _id: { toString(): string };
    type: PromoType;
    bonusEntries: number;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: {
      _id: { toString(): string };
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;
  };

  const promos = (await BonusEntryPromo.find(filter)
    .populate("createdBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .lean()) as unknown as Row[];

  const now = new Date();
  const rows: BonusEntryPromoRow[] = promos.map((promo) => {
    const isCurrentlyActive =
      promo.isActive && now >= promo.startDate && now <= promo.endDate;
    const isUpcoming = promo.isActive && promo.startDate > now;
    const isExpired = !promo.isActive || promo.endDate < now;
    return {
      id: promo._id.toString(),
      type: promo.type,
      bonusEntries: promo.bonusEntries,
      startDate: promo.startDate,
      endDate: promo.endDate,
      isActive: promo.isActive,
      isCurrentlyActive,
      isUpcoming,
      isExpired,
      description: promo.description,
      createdAt: promo.createdAt,
      updatedAt: promo.updatedAt,
      createdBy: promo.createdBy
        ? {
            id: promo.createdBy._id.toString(),
            name: `${promo.createdBy.firstName ?? ""} ${promo.createdBy.lastName ?? ""}`.trim(),
            email: promo.createdBy.email ?? "",
          }
        : null,
    };
  });

  return { data: rows, count: rows.length };
}

export interface ActiveBonusEntryPromoResult {
  data: BonusEntryPromoRow | null;
}

/**
 * Fetch the currently-active bonus-entry promo for a single package type, or
 * `null` if none. Mirrors the admin GET shape.
 */
export async function getActiveBonusEntryPromo(
  type: PromoType,
): Promise<ActiveBonusEntryPromoResult> {
  await connectDB();

  type Row = {
    _id: { toString(): string };
    type: PromoType;
    bonusEntries: number;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: {
      _id: { toString(): string };
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;
  };

  const now = new Date();
  const promo = (await BonusEntryPromo.findOne({
    type,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate("createdBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .lean()) as unknown as Row | null;

  if (!promo) return { data: null };

  return {
    data: {
      id: promo._id.toString(),
      type: promo.type,
      bonusEntries: promo.bonusEntries,
      startDate: promo.startDate,
      endDate: promo.endDate,
      isActive: promo.isActive,
      isCurrentlyActive: true,
      isUpcoming: false,
      isExpired: false,
      description: promo.description,
      createdAt: promo.createdAt,
      updatedAt: promo.updatedAt,
      createdBy: promo.createdBy
        ? {
            id: promo.createdBy._id.toString(),
            name: `${promo.createdBy.firstName ?? ""} ${promo.createdBy.lastName ?? ""}`.trim(),
            email: promo.createdBy.email ?? "",
          }
        : null,
    },
  };
}

// ─── Promo link ──────────────────────────────────────────────────────────────

export interface PromoLinkRow {
  id: string;
  code: string;
  bonusEntries: number;
  expiresAt: Date | null;
  isActive: boolean;
  appliesToMembership: boolean;
  appliesToOneTime: boolean;
  campaignType: "general" | "cancelled-membership-comeback";
  eligibilityAudience: "all" | "cancelled-members";
  eligibilityRules?: {
    requireInactiveSubscription?: boolean;
    cancelledWithinDays?: number;
  };
  isExpired: boolean;
  description?: string;
  usageCount: number;
  usedByCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface PromoLinkListParams {
  isActive?: boolean;
  expired?: boolean;
}

export interface PromoLinkListResult {
  data: PromoLinkRow[];
  count: number;
}

/**
 * List promo links with optional active / expired filters. Mirrors the admin
 * GET filter behaviour: `expired` is applied post-fetch using `expiresAt vs now`.
 */
export async function listPromoLinks(
  params: PromoLinkListParams,
): Promise<PromoLinkListResult> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (params.isActive !== undefined) filter.isActive = params.isActive;

  type Row = {
    _id: { toString(): string };
    code: string;
    bonusEntries: number;
    expiresAt?: Date | null;
    isActive: boolean;
    appliesToMembership?: boolean;
    appliesToOneTime?: boolean;
    campaignType?: "general" | "cancelled-membership-comeback";
    eligibilityAudience?: "all" | "cancelled-members";
    eligibilityRules?: {
      requireInactiveSubscription?: boolean;
      cancelledWithinDays?: number;
    };
    description?: string;
    usageCount: number;
    usedBy?: unknown[];
    createdAt: Date;
    updatedAt: Date;
    createdBy?: {
      _id: { toString(): string };
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;
  };

  const links = (await PromoLink.find(filter)
    .populate("createdBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .lean()) as unknown as Row[];

  const now = new Date();
  const rows: PromoLinkRow[] = links.map((link) => {
    const isExpired = link.expiresAt ? new Date(link.expiresAt) < now : false;
    return {
      id: link._id.toString(),
      code: link.code,
      bonusEntries: link.bonusEntries,
      expiresAt: link.expiresAt ?? null,
      isActive: link.isActive,
      appliesToMembership: link.appliesToMembership ?? false,
      appliesToOneTime: link.appliesToOneTime ?? false,
      campaignType: link.campaignType ?? "general",
      eligibilityAudience: link.eligibilityAudience ?? "all",
      eligibilityRules: link.eligibilityRules,
      isExpired,
      description: link.description,
      usageCount: link.usageCount,
      usedByCount: link.usedBy?.length ?? 0,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      createdBy: link.createdBy
        ? {
            id: link.createdBy._id.toString(),
            name: `${link.createdBy.firstName ?? ""} ${link.createdBy.lastName ?? ""}`.trim(),
            email: link.createdBy.email ?? "",
          }
        : null,
    };
  });

  let filtered = rows;
  if (params.expired === true) {
    filtered = rows.filter((r) => r.isExpired);
  } else if (params.expired === false) {
    filtered = rows.filter((r) => !r.isExpired);
  }

  return { data: filtered, count: filtered.length };
}

// ─── Scheduled promo ─────────────────────────────────────────────────────────

export interface ScheduledPromoRow {
  id: string;
  type: PromoType;
  multiplier: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isCurrentlyActive: boolean;
  isUpcoming: boolean;
  isExpired: boolean;
  name?: string;
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface ScheduledPromoListParams {
  type?: PromoType;
  isActive?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  includeDeleted?: boolean;
}

export interface ScheduledPromoListResult {
  data: ScheduledPromoRow[];
  count: number;
}

/**
 * List scheduled promos. Excludes soft-deleted rows by default
 * (`includeDeleted=false`). Mirrors the admin GET shape.
 */
export async function listScheduledPromos(
  params: ScheduledPromoListParams,
): Promise<ScheduledPromoListResult> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (params.type) filter.type = params.type;
  if (params.isActive !== undefined) filter.isActive = params.isActive;
  if (!params.includeDeleted) {
    filter.$or = [{ deletedAt: null }, { deletedAt: { $exists: false } }];
  }
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.startDate = range;
  }

  type Row = {
    _id: { toString(): string };
    type: PromoType;
    multiplier: number;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    name?: string;
    description?: string;
    deletedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: {
      _id: { toString(): string };
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;
  };

  const promos = (await ScheduledPromo.find(filter)
    .populate("createdBy", "firstName lastName email")
    .sort({ startDate: 1 })
    .lean()) as unknown as Row[];

  const now = new Date();
  const rows: ScheduledPromoRow[] = promos.map((p) => {
    const isCurrentlyActive =
      p.isActive && !p.deletedAt && now >= p.startDate && now <= p.endDate;
    const isUpcoming = p.isActive && !p.deletedAt && p.startDate > now;
    const isExpired = !!p.deletedAt || !p.isActive || p.endDate < now;
    return {
      id: p._id.toString(),
      type: p.type,
      multiplier: p.multiplier,
      startDate: p.startDate,
      endDate: p.endDate,
      isActive: p.isActive,
      isCurrentlyActive,
      isUpcoming,
      isExpired,
      name: p.name,
      description: p.description,
      deletedAt: p.deletedAt ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      createdBy: p.createdBy
        ? {
            id: p.createdBy._id.toString(),
            name: `${p.createdBy.firstName ?? ""} ${p.createdBy.lastName ?? ""}`.trim(),
            email: p.createdBy.email ?? "",
          }
        : null,
    };
  });

  return { data: rows, count: rows.length };
}

// ─── Promo banner text ───────────────────────────────────────────────────────

export interface PromoBannerTextRow {
  id: string;
  imageUrl: string;
  altText?: string;
  scheduleType: "one-time" | "recurring";
  startDate: Date | null;
  endDate: Date | null;
  recurrencePattern?:
    | "weekdays"
    | "weekends"
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}
