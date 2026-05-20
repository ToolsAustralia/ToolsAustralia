/**
 * Admin Error Reports API
 * 
 * Handles fetching and managing error reports (admin only).
 * Includes pagination, filtering, and statistics.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { requirePermission } from "@/lib/api-auth-permissions";
import { ErrorReportStatus } from "@/types/error-reporting";
import mongoose, { PipelineStage } from "mongoose";

type ErrorReportQuery = Record<string, unknown>;

const VALID_STATUSES: ErrorReportStatus[] = ["new", "investigating", "resolved", "dismissed"];
const VALID_CATEGORIES = ["payment", "network", "api", "system", "recovery"];
const VALID_SEVERITIES = ["critical", "high", "medium"];
const VALID_SORT_FIELDS = ["createdAt", "status", "errorMessage", "category", "severity"] as const;

function toStringId(value: unknown): unknown {
  if (value && typeof value === "object" && "toString" in value) {
    return (value as { toString(): string }).toString();
  }

  return value;
}

function buildErrorReportQuery(searchParams: URLSearchParams): ErrorReportQuery {
  const status = searchParams.get("status") as ErrorReportStatus | null;
  const userId = searchParams.get("userId") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;
  const severity = searchParams.get("severity") || undefined;
  const userEmail = searchParams.get("userEmail") || undefined;
  const autoLogged = searchParams.get("autoLogged");
  const apiEndpoint = searchParams.get("apiEndpoint") || undefined;
  const pageUrl = searchParams.get("pageUrl") || undefined;
  const includeArchived = searchParams.get("includeArchived") === "true";

  const query: ErrorReportQuery = {};
  const andClauses: ErrorReportQuery[] = [];

  if (!includeArchived) {
    query.archivedAt = { $exists: false };
  }

  if (status && VALID_STATUSES.includes(status)) {
    query.status = status;
  }

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    query.userId = new mongoose.Types.ObjectId(userId);
  }

  if (startDate || endDate) {
    const dateQuery: { $gte?: Date; $lte?: Date } = {};
    if (startDate) {
      dateQuery.$gte = new Date(startDate);
    }
    if (endDate) {
      const inclusiveEnd = new Date(endDate);
      inclusiveEnd.setHours(23, 59, 59, 999);
      dateQuery.$lte = inclusiveEnd;
    }
    query.createdAt = dateQuery;
  }

  if (category === "missing") {
    andClauses.push({ $or: [{ category: { $exists: false } }, { category: null }, { category: "" }] });
  } else if (category && VALID_CATEGORIES.includes(category)) {
    query.category = category;
  }

  if (severity === "missing") {
    andClauses.push({ $or: [{ severity: { $exists: false } }, { severity: null }, { severity: "" }] });
  } else if (severity && VALID_SEVERITIES.includes(severity)) {
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
    { $match: { ...query, createdAt: { ...(query.createdAt as object | undefined), $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } },
        errors: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 as const } },
  ];
}

/**
 * GET /api/admin/error-reports
 * Get error reports with filtering, pagination, and statistics
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - status: Filter by status (new, investigating, resolved, dismissed)
 * - userId: Filter by user ID
 * - startDate: Filter by start date (ISO string)
 * - endDate: Filter by end date (ISO string)
 * - search: Search in error messages
 * - sortBy: Sort field (createdAt, status, errorMessage) (default: createdAt)
 * - sortOrder: Sort order (asc, desc) (default: desc)
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("errorReports.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const query = buildErrorReportQuery(searchParams);

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    const sortField = VALID_SORT_FIELDS.includes(sortBy as (typeof VALID_SORT_FIELDS)[number]) ? sortBy : "createdAt";
    sort[sortField] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
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
      ErrorReport.countDocuments({ ...query, createdAt: { ...(query.createdAt as object | undefined), $gte: last24Hours } }),
      ErrorReport.countDocuments({ ...unresolvedQuery, severity: "critical" }),
      ErrorReport.countDocuments({ ...query, autoLogged: true }),
      ErrorReport.aggregate([{ $match: query }, { $group: { _id: { $ifNull: ["$category", "missing"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      ErrorReport.aggregate([{ $match: query }, { $group: { _id: { $ifNull: ["$severity", "missing"] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      ErrorReport.aggregate([
        { $match: query },
        { $group: { _id: { $substrCP: ["$errorMessage", 0, 140] }, count: { $sum: 1 }, latestAt: { $max: "$createdAt" } } },
        { $sort: { count: -1, latestAt: -1 } },
        { $limit: 10 },
      ]),
      ErrorReport.aggregate([
        { $match: { ...query, apiEndpoint: { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$apiEndpoint", count: { $sum: 1 }, latestAt: { $max: "$createdAt" } } },
        { $sort: { count: -1, latestAt: -1 } },
        { $limit: 10 },
      ]),
      ErrorReport.aggregate([
        { $match: query },
        {
          $project: {
            userKey: {
              $ifNull: ["$userEmail", { $ifNull: ["$guestEmail", { $toString: "$userId" }] }],
            },
            createdAt: 1,
          },
        },
        { $match: { userKey: { $nin: [null, "", "null"] } } },
        { $group: { _id: "$userKey", count: { $sum: 1 }, latestAt: { $max: "$createdAt" } } },
        { $sort: { count: -1, latestAt: -1 } },
        { $limit: 10 },
      ]),
      ErrorReport.aggregate([
        { $match: query },
        { $group: { _id: "$deduplicationHash", message: { $first: "$errorMessage" }, count: { $sum: 1 }, latestAt: { $max: "$createdAt" } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1, latestAt: -1 } },
        { $limit: 10 },
      ]),
      ErrorReport.aggregate(buildTrendPipeline(query)),
      ErrorReport.aggregate([
        { $match: { ...query, status: "resolved", resolvedAt: { $exists: true }, createdAt: { $exists: true } } },
        {
          $project: {
            hours: {
              $divide: [{ $subtract: ["$resolvedAt", "$createdAt"] }, 1000 * 60 * 60],
            },
          },
        },
        { $sort: { hours: 1 } },
        { $group: { _id: null, values: { $push: "$hours" }, averageHours: { $avg: "$hours" }, minHours: { $min: "$hours" }, maxHours: { $max: "$hours" }, totalResolved: { $sum: 1 } } },
      ]),
    ]);

    // Format status counts
    const byStatus: Record<ErrorReportStatus, number> = {
      new: 0,
      investigating: 0,
      resolved: 0,
      dismissed: 0,
    };

    statusCounts.forEach((item) => {
      if (item._id in byStatus) {
        byStatus[item._id as ErrorReportStatus] = item.count;
      }
    });

    const totalPages = Math.ceil(total / limit);
    const trendMap = new Map<string, number>(trendCounts.map((item) => [String(item._id), Number(item.errors)]));
    const trends = Array.from({ length: 30 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - index));
      const key = date.toISOString().slice(0, 10);
      return { date: key, errors: trendMap.get(key) || 0 };
    });
    const resolution = resolutionStats[0];
    const resolutionValues = resolution?.values || [];
    const medianHours =
      resolutionValues.length > 0 ? Number(resolutionValues[Math.floor(resolutionValues.length / 2)] || 0) : 0;
    const affectedUsers = await ErrorReport.distinct("userEmail", { ...query, userEmail: { $exists: true, $ne: "" } });
    const affectedGuests = await ErrorReport.distinct("guestEmail", { ...query, guestEmail: { $exists: true, $ne: "" } });

    const analytics = {
      scope: "filtered" as const,
      generatedAt: new Date().toISOString(),
      total,
      autoLogged: autoLoggedCount,
      trends,
      byCategory: categoryCounts.map((item) => ({ name: String(item._id || "missing"), value: item.count })),
      bySeverity: severityCounts.map((item) => ({ name: String(item._id || "missing"), value: item.count })),
      byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      topErrors: topErrors.map((item) => ({ key: String(item._id || "Unknown error"), count: item.count, latestAt: item.latestAt })),
      topEndpoints: topEndpoints.map((item) => ({ key: String(item._id || "Unknown endpoint"), count: item.count, latestAt: item.latestAt })),
      topUsers: topUsers.map((item) => ({ key: String(item._id || "Unknown user"), count: item.count, latestAt: item.latestAt })),
      repeatedErrors: repeatedErrors.map((item) => ({ key: String(item.message || item._id || "Repeated error"), count: item.count, latestAt: item.latestAt })),
      resolutionMetrics: resolution
        ? {
            averageHours: Math.round(Number(resolution.averageHours || 0) * 10) / 10,
            medianHours: Math.round(medianHours * 10) / 10,
            minHours: Math.round(Number(resolution.minHours || 0) * 10) / 10,
            maxHours: Math.round(Number(resolution.maxHours || 0) * 10) / 10,
            totalResolved: Number(resolution.totalResolved || 0),
          }
        : emptyResolutionMetrics(),
    };

    return NextResponse.json({
      reports: reports.map((report) => ({
        ...report,
        _id: String(toStringId(report._id)),
        userId: report.userId && typeof report.userId === "object" && "_id" in report.userId ? toStringId(report.userId._id) : report.userId,
        resolvedBy:
          report.resolvedBy && typeof report.resolvedBy === "object" && "_id" in report.resolvedBy
            ? toStringId(report.resolvedBy._id)
            : report.resolvedBy,
        archivedBy:
          report.archivedBy && typeof report.archivedBy === "object" && "_id" in report.archivedBy
            ? toStringId(report.archivedBy._id)
            : report.archivedBy,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
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
    });
  } catch (error) {
    console.error("Error fetching error reports:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch error reports",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

