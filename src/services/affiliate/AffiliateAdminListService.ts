// src/services/affiliate/AffiliateAdminListService.ts
//
// Admin-facing affiliate list + detail readers. Extracted from
// `GET /api/admin/affiliate/list` and `GET /api/admin/affiliate/[id]` so the
// admin route and Norm projection call the same code and report identical
// numbers by construction. Framework-agnostic — no Request / NextResponse types.

import mongoose from "mongoose";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import AffiliatePayout from "@/models/AffiliatePayout";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

export type AffiliateListSortKey =
  | "name"
  | "email"
  | "affiliateCode"
  | "totalSignups"
  | "totalSales"
  | "isActive"
  | "createdAt"
  | "unpaidAmount";

export interface ListAffiliatesArgs {
  page: number;
  limit: number;
  search: string;
  sort: AffiliateListSortKey;
  order: "asc" | "desc";
}

export interface AffiliateListRow {
  id: string;
  name: string;
  email: string;
  phone: string | undefined;
  username: string;
  affiliateCode: string;
  affiliateLink: string;
  isActive: boolean;
  totalSignups: number;
  totalSales: number;
  totalCommissions: number;
  unpaidCommissions: number;
  unpaidAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAffiliatesResult {
  affiliates: AffiliateListRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const RAW_SORT_MAP: Record<string, AffiliateListSortKey> = {
  name: "name",
  email: "email",
  affiliatecode: "affiliateCode",
  code: "affiliateCode",
  totalsignups: "totalSignups",
  signups: "totalSignups",
  totalsales: "totalSales",
  sales: "totalSales",
  isactive: "isActive",
  status: "isActive",
  unpaidamount: "unpaidAmount",
  unpaid: "unpaidAmount",
  createdat: "createdAt",
  created: "createdAt",
};

/**
 * Normalize a free-form sort token (case-insensitive) into the canonical
 * AffiliateListSortKey. Unknown tokens fall back to "createdAt".
 */
export function resolveAffiliateListSortKey(raw: string): AffiliateListSortKey {
  return RAW_SORT_MAP[raw.toLowerCase()] ?? "createdAt";
}

export async function listAffiliates(args: ListAffiliatesArgs): Promise<ListAffiliatesResult> {
  const page = Math.max(1, Math.floor(args.page) || 1);
  const limit = Math.min(Math.max(1, Math.floor(args.limit) || 25), 100);
  const search = args.search.trim();
  const sortKey = args.sort;
  const orderNum: 1 | -1 = args.order === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { affiliateCode: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const total = await Affiliate.countDocuments(filter);

  let affiliatesRaw: Array<Record<string, unknown> & { _id: mongoose.Types.ObjectId }>;
  let unpaidFromAggregate = false;

  if (sortKey === "unpaidAmount") {
    const commColl = AffiliateCommission.collection.name;
    const pipeline: mongoose.PipelineStage[] = [
      { $match: filter },
      {
        $lookup: {
          from: commColl,
          let: { aid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$affiliateId", "$$aid"] }, { $eq: ["$status", "pending"] }],
                },
              },
            },
            {
              $group: {
                _id: null,
                unpaidAmount: { $sum: "$commissionAmount" },
                unpaidCount: { $sum: 1 },
              },
            },
          ],
          as: "_pendingUnpaid",
        },
      },
      {
        $addFields: {
          _unpaidAmount: { $ifNull: [{ $arrayElemAt: ["$_pendingUnpaid.unpaidAmount", 0] }, 0] },
          _unpaidCount: { $ifNull: [{ $arrayElemAt: ["$_pendingUnpaid.unpaidCount", 0] }, 0] },
        },
      },
      { $sort: { _unpaidAmount: orderNum, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { password: 0, _pendingUnpaid: 0 } },
    ];

    affiliatesRaw = (await Affiliate.aggregate(pipeline)) as typeof affiliatesRaw;
    unpaidFromAggregate = true;
  } else {
    const mongoSort: Record<string, 1 | -1> = {
      [sortKey]: orderNum,
      ...(sortKey !== "createdAt" ? { createdAt: -1 as const } : {}),
    };
    affiliatesRaw = (await Affiliate.find(filter)
      .select("-password")
      .sort(mongoSort)
      .skip(skip)
      .limit(limit)
      .lean()) as unknown as typeof affiliatesRaw;
  }

  const affiliateIds = affiliatesRaw.map((a) => a._id);

  let unpaidMap: Map<string, { count: number; amount: number }>;
  if (unpaidFromAggregate) {
    unpaidMap = new Map(
      affiliatesRaw.map((a) => {
        const id = a._id.toString();
        const count = typeof a._unpaidCount === "number" ? (a._unpaidCount as number) : 0;
        const amount = typeof a._unpaidAmount === "number" ? (a._unpaidAmount as number) : 0;
        return [id, { count, amount }];
      })
    );
  } else {
    const unpaidCommissions = await AffiliateCommission.aggregate<{
      _id: mongoose.Types.ObjectId;
      unpaidCount: number;
      unpaidAmount: number;
    }>([
      {
        $match: {
          affiliateId: { $in: affiliateIds },
          status: "pending",
        },
      },
      {
        $group: {
          _id: "$affiliateId",
          unpaidCount: { $sum: 1 },
          unpaidAmount: { $sum: "$commissionAmount" },
        },
      },
    ]);
    unpaidMap = new Map(
      unpaidCommissions.map((uc) => [
        uc._id.toString(),
        { count: uc.unpaidCount, amount: uc.unpaidAmount },
      ])
    );
  }

  const affiliates: AffiliateListRow[] = affiliatesRaw.map((affiliate) => {
    const id = affiliate._id.toString();
    const unpaid = unpaidMap.get(id) || { count: 0, amount: 0 };
    return {
      id,
      name: affiliate.name as string,
      email: affiliate.email as string,
      phone: affiliate.phone as string | undefined,
      username: affiliate.username as string,
      affiliateCode: affiliate.affiliateCode as string,
      affiliateLink: affiliate.affiliateLink as string,
      isActive: affiliate.isActive as boolean,
      totalSignups: (affiliate.totalSignups as number) ?? 0,
      totalSales: (affiliate.totalSales as number) ?? 0,
      totalCommissions: (affiliate.totalCommissions as number) ?? 0,
      unpaidCommissions: unpaid.count,
      unpaidAmount: unpaid.amount,
      createdAt: affiliate.createdAt as Date,
      updatedAt: affiliate.updatedAt as Date,
    };
  });

  return {
    affiliates,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

// ─── Detail ────────────────────────────────────────────────────────────────

export type AffiliateDetailSortField =
  | "earnedAt"
  | "commissionAmount"
  | "purchaseAmount"
  | "packageName"
  | "user"
  | "type"
  | "status";

export interface GetAffiliateDetailArgs {
  id: string;
  page: number;
  pageSize: number;
  sort: AffiliateDetailSortField;
  order: "asc" | "desc";
  q: string;
  referredPage: number;
  referredPageSize: number;
  referredSort: "name" | "email" | "phone" | "referredAt";
  referredOrder: "asc" | "desc";
}

export interface AffiliateDetailResult {
  affiliate: {
    id: string;
    name: string;
    email: string;
    phone: string | undefined;
    username: string;
    affiliateCode: string;
    affiliateLink: string;
    isActive: boolean;
    commissionRate: number;
    totalSignups: number;
    totalSales: number;
    totalCommissions: number;
    bankDetails?: {
      accountName?: string;
      bsb?: string;
      accountNumber?: string;
      bankName?: string;
    };
    createdAt: Date;
    updatedAt: Date;
  };
  referredUsers: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone: string | null;
    referredAt: Date;
  }>;
  referredUsersPagination: { total: number; page: number; pageSize: number; totalPages: number };
  commissions: Array<{
    id: string;
    type: string;
    packageName: string;
    purchaseAmount: number;
    commissionAmount: number;
    status: string;
    earnedAt: Date;
    paidAt: Date | undefined;
    referredUser: { id: string; name: string; email: string | undefined } | null;
  }>;
  commissionsPagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    sort: AffiliateDetailSortField;
    order: "asc" | "desc";
    q: string | undefined;
  };
  pendingCommissionsSummary: { count: number; totalAmount: number };
  payouts: Array<{
    id: string;
    totalAmount: number;
    commissionCount: number;
    paidAt: Date;
    processedBy: { id: string; name: string; email: string | undefined } | null;
    notes: string | undefined;
  }>;
}

function resolveCommissionPackageDisplay(
  packageId: string | undefined,
  packageName: string | undefined,
  commissionType: string
): string {
  if (packageName?.trim()) return packageName.trim();
  if (packageId) {
    const pkg = getPackageById(packageId);
    if (pkg?.name) return pkg.name;
  }
  if (commissionType === "membership-recurring") return "Subscription renewal";
  if (commissionType === "mini-draw-package") return "Mini draw package";
  return "N/A";
}

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (s: string) => s.replace(ESCAPE_REGEX, "\\$&");

/**
 * Returns null when the id is invalid OR the affiliate does not exist.
 * Callers distinguish via `result === null`; this matches the admin route's
 * 400 vs 404 split via {@link isValidAffiliateId} below.
 */
export function isValidAffiliateId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function getAffiliateDetail(
  args: GetAffiliateDetailArgs
): Promise<AffiliateDetailResult | null> {
  const id = args.id;
  if (!isValidAffiliateId(id)) return null;

  const affiliate = await Affiliate.findById(id).select("-password").lean();
  if (!affiliate) return null;

  const page = Math.max(1, Math.floor(args.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(args.pageSize) || 20));
  const referredPage = Math.max(1, Math.floor(args.referredPage) || 1);
  const referredPageSize = Math.min(50, Math.max(1, Math.floor(args.referredPageSize) || 10));
  const referredOrderDir: 1 | -1 = args.referredOrder === "asc" ? 1 : -1;
  const order: 1 | -1 = args.order === "asc" ? 1 : -1;
  const q = args.q.trim();
  const sortField = args.sort;

  const affiliateObjectId = new mongoose.Types.ObjectId(id);
  const usersCollection = User.collection.name;

  const pipeline: mongoose.PipelineStage[] = [
    { $match: { affiliateId: affiliateObjectId } },
    {
      $lookup: {
        from: usersCollection,
        localField: "referredUserId",
        foreignField: "_id",
        as: "refUserArr",
      },
    },
    { $unwind: { path: "$refUserArr", preserveNullAndEmptyArrays: true } },
  ];

  if (q.length > 0) {
    const rx = escapeRegex(q);
    pipeline.push({
      $match: {
        $or: [
          { "refUserArr.email": { $regex: rx, $options: "i" } },
          { "refUserArr.firstName": { $regex: rx, $options: "i" } },
          { "refUserArr.lastName": { $regex: rx, $options: "i" } },
        ],
      },
    });
  }

  if (sortField === "user") {
    pipeline.push({
      $addFields: {
        _sortUserName: {
          $toLower: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$refUserArr.firstName", ""] },
                  " ",
                  { $ifNull: ["$refUserArr.lastName", ""] },
                ],
              },
            },
          },
        },
      },
    });
  }

  if (sortField === "type") {
    pipeline.push({
      $sort: { commissionType: order, earnedAt: -1 } as Record<string, 1 | -1>,
    });
  } else if (sortField === "packageName") {
    pipeline.push({
      $sort: { packageName: order, earnedAt: -1 } as Record<string, 1 | -1>,
    });
  } else if (sortField === "status") {
    pipeline.push({
      $sort: { status: order, earnedAt: -1 } as Record<string, 1 | -1>,
    });
  } else {
    const sortKey =
      sortField === "commissionAmount"
        ? "commissionAmount"
        : sortField === "purchaseAmount"
          ? "purchaseAmount"
          : sortField === "user"
            ? "_sortUserName"
            : "earnedAt";
    pipeline.push({ $sort: { [sortKey]: order } as Record<string, 1 | -1> });
  }

  pipeline.push({
    $facet: {
      pageDocs: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
      totalCount: [{ $count: "count" }],
    },
  });

  const aggResult = await AffiliateCommission.aggregate(pipeline);
  const facet = aggResult[0] as {
    pageDocs: Array<Record<string, unknown>>;
    totalCount: Array<{ count: number }>;
  };

  const total = facet?.totalCount?.[0]?.count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const pageDocs = facet?.pageDocs ?? [];

  const commissions = pageDocs.map((raw) => {
    const c = raw as {
      _id: mongoose.Types.ObjectId;
      commissionType: string;
      packageId?: string;
      packageName?: string;
      purchaseAmount: number;
      commissionAmount: number;
      status: string;
      earnedAt: Date;
      paidAt?: Date;
      refUserArr?: {
        _id: mongoose.Types.ObjectId;
        firstName?: string;
        lastName?: string;
        email?: string;
      };
    };
    const ref = c.refUserArr;
    return {
      id: c._id.toString(),
      type: c.commissionType,
      packageName: resolveCommissionPackageDisplay(c.packageId, c.packageName, c.commissionType),
      purchaseAmount: c.purchaseAmount,
      commissionAmount: c.commissionAmount,
      status: c.status,
      earnedAt: c.earnedAt,
      paidAt: c.paidAt,
      referredUser: ref
        ? {
            id: ref._id.toString(),
            name: `${ref.firstName || ""} ${ref.lastName || ""}`.trim(),
            email: ref.email,
          }
        : null,
    };
  });

  const [pendingAgg] = await AffiliateCommission.aggregate<{
    count: number;
    totalAmount: number;
  }>([
    { $match: { affiliateId: affiliateObjectId, status: "pending" } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalAmount: { $sum: "$commissionAmount" },
      },
    },
  ]);

  const pendingCommissionsSummary = {
    count: pendingAgg?.count ?? 0,
    totalAmount: pendingAgg?.totalAmount ?? 0,
  };

  const payouts = await AffiliatePayout.find({
    affiliateId: affiliateObjectId,
  })
    .sort({ paidAt: -1 })
    .populate("processedBy", "firstName lastName email")
    .lean();

  const referredQuery = {
    "affiliateReferral.affiliateId": affiliateObjectId,
  } as const;
  const referredTotal = await User.countDocuments(referredQuery);
  const referredTotalPages = referredTotal === 0 ? 0 : Math.ceil(referredTotal / referredPageSize);

  const referredSortKey = args.referredSort;
  const referredSortMongo: Record<string, 1 | -1> =
    referredSortKey === "name"
      ? { firstName: referredOrderDir, lastName: referredOrderDir }
      : referredSortKey === "email"
        ? { email: referredOrderDir }
        : referredSortKey === "phone"
          ? { mobile: referredOrderDir }
          : { "affiliateReferral.referredAt": referredOrderDir };

  const referredUsersRaw = await User.find(referredQuery)
    .select("firstName lastName email mobile affiliateReferral.referredAt createdAt")
    .sort(referredSortMongo)
    .skip((referredPage - 1) * referredPageSize)
    .limit(referredPageSize)
    .lean();

  return {
    affiliate: {
      id: affiliate._id.toString(),
      name: affiliate.name as string,
      email: affiliate.email as string,
      phone: affiliate.phone as string | undefined,
      username: affiliate.username as string,
      affiliateCode: affiliate.affiliateCode as string,
      affiliateLink: affiliate.affiliateLink as string,
      isActive: affiliate.isActive as boolean,
      commissionRate: (affiliate.commissionRate as number) ?? 0.3,
      totalSignups: (affiliate.totalSignups as number) ?? 0,
      totalSales: (affiliate.totalSales as number) ?? 0,
      totalCommissions: (affiliate.totalCommissions as number) ?? 0,
      bankDetails: affiliate.bankDetails as AffiliateDetailResult["affiliate"]["bankDetails"],
      createdAt: affiliate.createdAt as Date,
      updatedAt: affiliate.updatedAt as Date,
    },
    referredUsers: referredUsersRaw.map((user) => ({
      id: user._id.toString(),
      firstName: user.firstName as string | undefined,
      lastName: user.lastName as string | undefined,
      email: user.email as string | undefined,
      phone: (user.mobile as string | undefined) || null,
      referredAt:
        (user.affiliateReferral as { referredAt?: Date } | undefined)?.referredAt ||
        (user.createdAt as Date),
    })),
    referredUsersPagination: {
      total: referredTotal,
      page: referredPage,
      pageSize: referredPageSize,
      totalPages: referredTotalPages,
    },
    commissions,
    commissionsPagination: {
      total,
      page,
      pageSize,
      totalPages,
      sort: sortField,
      order: args.order,
      q: q || undefined,
    },
    pendingCommissionsSummary,
    payouts: payouts.map((p) => {
      const pb = p.processedBy as
        | {
            _id?: mongoose.Types.ObjectId | string;
            firstName?: string;
            lastName?: string;
            email?: string;
          }
        | null
        | undefined;
      return {
        id: p._id.toString(),
        totalAmount: p.totalAmount as number,
        commissionCount: p.commissionCount as number,
        paidAt: p.paidAt as Date,
        processedBy: pb
          ? {
              id: pb._id ? String(pb._id) : "",
              name: `${pb.firstName || ""} ${pb.lastName || ""}`.trim(),
              email: pb.email,
            }
          : null,
        notes: p.notes as string | undefined,
      };
    }),
  };
}

/**
 * Detail-sort field resolver used by both the admin route and Norm projection.
 */
const DETAIL_SORT_MAP: Record<string, AffiliateDetailSortField> = {
  earnedat: "earnedAt",
  commissionamount: "commissionAmount",
  earnings: "commissionAmount",
  commission: "commissionAmount",
  purchase: "purchaseAmount",
  purchaseamount: "purchaseAmount",
  package: "packageName",
  packagename: "packageName",
  user: "user",
  referreduser: "user",
  type: "type",
  commissiontype: "type",
  status: "status",
  commissionstatus: "status",
};

export function resolveAffiliateDetailSortField(raw: string): AffiliateDetailSortField {
  return DETAIL_SORT_MAP[raw.toLowerCase()] ?? "earnedAt";
}

const REFERRED_SORT_MAP: Record<string, "name" | "email" | "phone" | "referredAt"> = {
  name: "name",
  user: "name",
  email: "email",
  phone: "phone",
  mobile: "phone",
  referredat: "referredAt",
};

export function resolveAffiliateReferredSortKey(
  raw: string
): "name" | "email" | "phone" | "referredAt" {
  return REFERRED_SORT_MAP[raw.toLowerCase()] ?? "referredAt";
}
