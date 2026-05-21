/**
 * PromoQueryService
 *
 * Read-side service for the core Promo collection (toggle-system promos).
 * Shared between the admin GET routes (`/api/admin/promo/active`,
 * `/api/admin/promo/history`) and the Norm read endpoints under
 * `/api/internal/norm/v1/promo/*`. By construction the admin UI and the
 * Norm projection draw from the same code path.
 *
 * Note: the Promo "toggle system" intentionally ignores startDate/endDate for
 * activation — only `isActive` matters. The legacy time-remaining numbers are
 * preserved here as zero/false for backward compatibility with the admin shape.
 */
import connectDB from "@/lib/mongodb";
import Promo, { IPromo } from "@/models/Promo";

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
