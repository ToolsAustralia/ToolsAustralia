/**
 * Error Report Query Service
 *
 * Centralised read-side queries for the ErrorReport collection. Extracted from
 * the admin route handlers so both the admin UI and the Norm internal API share
 * one implementation — by construction the numbers must agree.
 *
 * Framework-agnostic: takes plain args, returns plain values. No Request /
 * NextResponse types live here.
 */
import mongoose, { type PipelineStage } from "mongoose";
import ErrorReport from "@/models/ErrorReport";
import type { ErrorReportStatus } from "@/types/error-reporting";

type ErrorReportQuery = Record<string, unknown>;

const VALID_STATUSES: ReadonlySet<ErrorReportStatus> = new Set([
  "new",
  "investigating",
  "resolved",
  "dismissed",
]);
const VALID_CATEGORIES = new Set([
  "payment",
  "network",
  "api",
  "system",
  "recovery",
]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium"]);
const VALID_SORT_FIELDS = new Set([
  "createdAt",
  "status",
  "errorMessage",
  "category",
  "severity",
]);

/**
 * Input filter for {@link listErrorReports}. Mirrors the admin query string
 * shape so the admin route can pass `Object.fromEntries(searchParams)` through
 * untouched; the Norm wrapper provides a narrower projection.
 */
export interface ErrorReportListInput {
  page?: number;
  limit?: number;
  status?: string | null;
  userId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
  sortBy?: string | null;
  sortOrder?: string | null;
  category?: string | null;
  severity?: string | null;
  userEmail?: string | null;
  autoLogged?: string | null;
  apiEndpoint?: string | null;
  pageUrl?: string | null;
  includeArchived?: boolean;
}

function toStringId(value: unknown): unknown {
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString(): string }).toString();
  }
  return value;
}

function buildErrorReportQuery(input: ErrorReportListInput): ErrorReportQuery {
  const status = input.status as ErrorReportStatus | null | undefined;
  const userId = input.userId || undefined;
  const startDate = input.startDate || undefined;
  const endDate = input.endDate || undefined;
  const search = input.search || undefined;
  const category = input.category || undefined;
  const severity = input.severity || undefined;
  const userEmail = input.userEmail || undefined;
  const autoLogged = input.autoLogged;
  const apiEndpoint = input.apiEndpoint || undefined;
  const pageUrl = input.pageUrl || undefined;
  const includeArchived = input.includeArchived === true;

  const query: ErrorReportQuery = {};
  const andClauses: ErrorReportQuery[] = [];

  if (!includeArchived) {
    query.archivedAt = { $exists: false };
  }

  if (status && VALID_STATUSES.has(status)) {
    query.status = status;
  }

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    query.userId = new mongoose.Types.ObjectId(userId);
  }

  if (startDate || endDate) {
    const dateQuery: { $gte?: Date; $lte?: Date } = {};
    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) {
      const inclusiveEnd = new Date(endDate);
      inclusiveEnd.setHours(23, 59, 59, 999);
      dateQuery.$lte = inclusiveEnd;
    }
    query.createdAt = dateQuery;
  }

  if (category === "missing") {
    andClauses.push({
      $or: [{ category: { $exists: false } }, { category: null }, { category: "" }],
    });
  } else if (category && VALID_CATEGORIES.has(category)) {
    query.category = category;
  }

  if (severity === "missing") {
    andClauses.push({
      $or: [{ severity: { $exists: false } }, { severity: null }, { severity: "" }],
    });
  } else if (severity && VALID_SEVERITIES.has(severity)) {
    query.severity = severity;
  }

  if (userEmail) {
    andClauses.push({
      $or: [
        { userEmail: { $regex: userEmail, $options: "i" } },
        { guestEmail: { $regex: userEmail, $options: "i" } },
      ],
    });
  }

  if (autoLogged === "true" || autoLogged === "false") {
    query.autoLogged = autoLogged === "true";
  }

  if (apiEndpoint) {
    query.apiEndpoint = { $regex: apiEndpoint, $options: "i" };
  }

  if (pageUrl) {
    andClauses.push({
      $or: [
        { route: { $regex: pageUrl, $options: "i" } },
        { currentUrl: { $regex: pageUrl, $options: "i" } },
      ],
    });
  }

  if (search) {
    andClauses.push({
      $or: [
        { errorMessage: { $regex: search, $options: "i" } },
        { errorName: { $regex: search, $options: "i" } },
        { userNotes: { $regex: search, $options: "i" } },
        { adminNotes: { $regex: search, $options: "i" } },
        { apiEndpoint: { $regex: search, $options: "i" } },
        { requestUrl: { $regex: search, $options: "i" } },
        { currentUrl: { $regex: search, $options: "i" } },
        { route: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { guestEmail: { $regex: search, $options: "i" } },
      ],
    });
  }

  if (andClauses.length > 0) {
    query.$and = andClauses;
  }

  return query;
}

function emptyResolutionMetrics() {
  return {
    averageHours: 0,
    medianHours: 0,
    minHours: 0,
    maxHours: 0,
    totalResolved: 0,
  };
}

function buildTrendPipeline(query: ErrorReportQuery): PipelineStage[] {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  return [
    {
      $match: {
        ...query,
        createdAt: { ...(query.createdAt as object | undefined), $gte: since },
      },
    },
    {
      $group: {
        _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } },
        errors: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 as const } },
  ];
}

export interface ErrorReportListResult {
  reports: Array<Record<string, unknown>>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  statistics: {
    total: number;
    byStatus: Record<ErrorReportStatus, number>;
    recentCount: number;
    needsAttention: number;
    criticalUnresolved: number;
    repeatedErrors: number;
    affectedUsers: number;
  };
  analytics: ReturnType<typeof buildAnalytics>;
}

interface BuildAnalyticsArgs {
  total: number;
  autoLoggedCount: number;
  categoryCounts: Array<{ _id: unknown; count: number }>;
  severityCounts: Array<{ _id: unknown; count: number }>;
  byStatus: Record<ErrorReportStatus, number>;
  topErrors: Array<{ _id: unknown; count: number; latestAt?: Date }>;
  topEndpoints: Array<{ _id: unknown; count: number; latestAt?: Date }>;
  topUsers: Array<{ _id: unknown; count: number; latestAt?: Date }>;
  repeatedErrors: Array<{ _id: unknown; message?: unknown; count: number; latestAt?: Date }>;
  trends: Array<{ date: string; errors: number }>;
  resolution: {
    averageHours?: number;
    minHours?: number;
    maxHours?: number;
    totalResolved?: number;
    values?: number[];
  } | undefined;
}

function buildAnalytics(args: BuildAnalyticsArgs) {
  const resolutionValues = args.resolution?.values ?? [];
  const medianHours =
    resolutionValues.length > 0
      ? Number(resolutionValues[Math.floor(resolutionValues.length / 2)] || 0)
      : 0;

  return {
    scope: "filtered" as const,
    generatedAt: new Date().toISOString(),
    total: args.total,
    autoLogged: args.autoLoggedCount,
    trends: args.trends,
    byCategory: args.categoryCounts.map((item) => ({
      name: String(item._id || "missing"),
      value: item.count,
    })),
    bySeverity: args.severityCounts.map((item) => ({
      name: String(item._id || "missing"),
      value: item.count,
    })),
    byStatus: Object.entries(args.byStatus).map(([name, value]) => ({ name, value })),
    topErrors: args.topErrors.map((item) => ({
      key: String(item._id || "Unknown error"),
      count: item.count,
      latestAt: item.latestAt,
    })),
    topEndpoints: args.topEndpoints.map((item) => ({
      key: String(item._id || "Unknown endpoint"),
      count: item.count,
      latestAt: item.latestAt,
    })),
    topUsers: args.topUsers.map((item) => ({
      key: String(item._id || "Unknown user"),
      count: item.count,
      latestAt: item.latestAt,
    })),
    repeatedErrors: args.repeatedErrors.map((item) => ({
      key: String(item.message || item._id || "Repeated error"),
      count: item.count,
      latestAt: item.latestAt,
    })),
    resolutionMetrics: args.resolution
      ? {
          averageHours: Math.round(Number(args.resolution.averageHours || 0) * 10) / 10,
          medianHours: Math.round(medianHours * 10) / 10,
          minHours: Math.round(Number(args.resolution.minHours || 0) * 10) / 10,
          maxHours: Math.round(Number(args.resolution.maxHours || 0) * 10) / 10,
          totalResolved: Number(args.resolution.totalResolved || 0),
        }
      : emptyResolutionMetrics(),
  };
}

/**
 * List error reports with pagination, filtering, and pre-aggregated analytics.
 * Returns the exact shape consumed by both the admin UI and Norm's projection.
 */
export async function listErrorReports(
  input: ErrorReportListInput,
): Promise<ErrorReportListResult> {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const sortByRaw = input.sortBy || "createdAt";
  const sortOrder = input.sortOrder || "desc";
  const query = buildErrorReportQuery(input);

  const sortField = VALID_SORT_FIELDS.has(sortByRaw) ? sortByRaw : "createdAt";
  const sort: Record<string, 1 | -1> = { [sortField]: sortOrder === "desc" ? -1 : 1 };

  const skip = (page - 1) * limit;
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const unresolvedQuery = { ...query, status: { $in: ["new", "investigating"] } };

  const [
    reports,
    total,
    statusCounts,
    recentCount,
    criticalUnresolved,
    autoLoggedCount,
    categoryCounts,
    severityCounts,
    topErrors,
    topEndpoints,
    topUsers,
    repeatedErrors,
    trendCounts,
    resolutionStats,
  ] = await Promise.all([
    ErrorReport.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("userId", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .lean(),
    ErrorReport.countDocuments(query),
    ErrorReport.aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ErrorReport.countDocuments({
      ...query,
      createdAt: { ...(query.createdAt as object | undefined), $gte: last24Hours },
    }),
    ErrorReport.countDocuments({ ...unresolvedQuery, severity: "critical" }),
    ErrorReport.countDocuments({ ...query, autoLogged: true }),
    ErrorReport.aggregate([
      { $match: query },
      { $group: { _id: { $ifNull: ["$category", "missing"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ErrorReport.aggregate([
      { $match: query },
      { $group: { _id: { $ifNull: ["$severity", "missing"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ErrorReport.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $substrCP: ["$errorMessage", 0, 140] },
          count: { $sum: 1 },
          latestAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1, latestAt: -1 } },
      { $limit: 10 },
    ]),
    ErrorReport.aggregate([
      { $match: { ...query, apiEndpoint: { $exists: true, $nin: [null, ""] } } },
      {
        $group: {
          _id: "$apiEndpoint",
          count: { $sum: 1 },
          latestAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1, latestAt: -1 } },
      { $limit: 10 },
    ]),
    ErrorReport.aggregate([
      { $match: query },
      {
        $project: {
          userKey: {
            $ifNull: [
              "$userEmail",
              { $ifNull: ["$guestEmail", { $toString: "$userId" }] },
            ],
          },
          createdAt: 1,
        },
      },
      { $match: { userKey: { $nin: [null, "", "null"] } } },
      {
        $group: {
          _id: "$userKey",
          count: { $sum: 1 },
          latestAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1, latestAt: -1 } },
      { $limit: 10 },
    ]),
    ErrorReport.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$deduplicationHash",
          message: { $first: "$errorMessage" },
          count: { $sum: 1 },
          latestAt: { $max: "$createdAt" },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, latestAt: -1 } },
      { $limit: 10 },
    ]),
    ErrorReport.aggregate(buildTrendPipeline(query)),
    ErrorReport.aggregate([
      {
        $match: {
          ...query,
          status: "resolved",
          resolvedAt: { $exists: true },
          createdAt: { $exists: true },
        },
      },
      {
        $project: {
          hours: {
            $divide: [{ $subtract: ["$resolvedAt", "$createdAt"] }, 1000 * 60 * 60],
          },
        },
      },
      { $sort: { hours: 1 } },
      {
        $group: {
          _id: null,
          values: { $push: "$hours" },
          averageHours: { $avg: "$hours" },
          minHours: { $min: "$hours" },
          maxHours: { $max: "$hours" },
          totalResolved: { $sum: 1 },
        },
      },
    ]),
  ]);

  const byStatus: Record<ErrorReportStatus, number> = {
    new: 0,
    investigating: 0,
    resolved: 0,
    dismissed: 0,
  };
  statusCounts.forEach((item: { _id: string; count: number }) => {
    if (item._id in byStatus) {
      byStatus[item._id as ErrorReportStatus] = item.count;
    }
  });

  const trendMap = new Map<string, number>(
    trendCounts.map((item: { _id: unknown; errors: unknown }) => [
      String(item._id),
      Number(item.errors),
    ]),
  );
  const trends = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    const key = date.toISOString().slice(0, 10);
    return { date: key, errors: trendMap.get(key) || 0 };
  });

  const resolution = resolutionStats[0];
  const analytics = buildAnalytics({
    total,
    autoLoggedCount,
    categoryCounts,
    severityCounts,
    byStatus,
    topErrors,
    topEndpoints,
    topUsers,
    repeatedErrors,
    trends,
    resolution,
  });

  const affectedUsers = await ErrorReport.distinct("userEmail", {
    ...query,
    userEmail: { $exists: true, $ne: "" },
  });
  const affectedGuests = await ErrorReport.distinct("guestEmail", {
    ...query,
    guestEmail: { $exists: true, $ne: "" },
  });

  const totalPages = Math.ceil(total / limit);

  return {
    reports: reports.map((report) => ({
      ...report,
      _id: String(toStringId(report._id)),
      userId:
        report.userId && typeof report.userId === "object" && "_id" in report.userId
          ? toStringId(report.userId._id)
          : report.userId,
      resolvedBy:
        report.resolvedBy &&
        typeof report.resolvedBy === "object" &&
        "_id" in report.resolvedBy
          ? toStringId(report.resolvedBy._id)
          : report.resolvedBy,
      archivedBy:
        report.archivedBy &&
        typeof report.archivedBy === "object" &&
        "_id" in report.archivedBy
          ? toStringId(report.archivedBy._id)
          : report.archivedBy,
    })),
    pagination: { page, limit, total, totalPages },
    statistics: {
      total,
      byStatus,
      recentCount,
      needsAttention: byStatus.new + byStatus.investigating,
      criticalUnresolved,
      repeatedErrors: analytics.repeatedErrors.length,
      affectedUsers: new Set([...affectedUsers, ...affectedGuests]).size,
    },
    analytics,
  };
}

export type ErrorReportDetail = Record<string, unknown> & { _id: string };

/**
 * Get a single error report by ObjectId. Returns `null` for invalid IDs or
 * when no document matches.
 */
export async function getErrorReportById(id: string): Promise<ErrorReportDetail | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const report = await ErrorReport.findById(id)
    .populate("userId", "firstName lastName email")
    .populate("resolvedBy", "firstName lastName email")
    .lean();
  if (!report || Array.isArray(report)) return null;

  const doc = report as {
    _id: { toString(): string } | string;
    userId?:
      | { _id: { toString(): string } | string; firstName?: string; lastName?: string; email?: string }
      | string
      | null;
    resolvedBy?:
      | { _id: { toString(): string } | string; firstName?: string; lastName?: string; email?: string }
      | string
      | null;
    [key: string]: unknown;
  };

  const flattenRef = (
    ref: typeof doc.userId,
  ): string | undefined => {
    if (!ref) return undefined;
    if (typeof ref === "string") return ref;
    if (typeof ref === "object" && ref !== null && "_id" in ref) {
      const inner = ref._id;
      if (typeof inner === "object" && inner !== null && "toString" in inner) {
        return inner.toString();
      }
      return String(inner);
    }
    return undefined;
  };

  return {
    ...doc,
    _id:
      typeof doc._id === "object" && doc._id !== null && "toString" in doc._id
        ? doc._id.toString()
        : String(doc._id),
    userId: flattenRef(doc.userId),
    resolvedBy: flattenRef(doc.resolvedBy),
  };
}
