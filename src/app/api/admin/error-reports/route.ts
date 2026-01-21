/**
 * Admin Error Reports API
 * 
 * Handles fetching and managing error reports (admin only).
 * Includes pagination, filtering, and statistics.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ErrorReportStatus } from "@/types/error-reporting";
import User from "@/models/User";

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
    await connectDB();

    // Check authentication and admin role
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await User.findById(session.user.id).lean();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const status = searchParams.get("status") as ErrorReportStatus | null;
    const userId = searchParams.get("userId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined; // ✅ NEW: Filter by category
    const severity = searchParams.get("severity") || undefined; // ✅ NEW: Filter by severity
    const userEmail = searchParams.get("userEmail") || undefined; // ✅ NEW: Filter by user email (authenticated or guest)
    const autoLogged = searchParams.get("autoLogged"); // ✅ NEW: Filter by auto-logged flag
    const apiEndpoint = searchParams.get("apiEndpoint") || undefined; // ✅ NEW: Filter by API endpoint
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build query
    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }

    if (userId) {
      query.userId = userId;
    }

    if (startDate || endDate) {
      const dateQuery: { $gte?: Date; $lte?: Date } = {};
      if (startDate) {
        dateQuery.$gte = new Date(startDate);
      }
      if (endDate) {
        dateQuery.$lte = new Date(endDate);
      }
      query.createdAt = dateQuery;
    }

    // ✅ NEW: Filter by category
    if (category) {
      query.category = category;
    }

    // ✅ NEW: Filter by severity
    if (severity) {
      query.severity = severity;
    }

    // ✅ NEW: Filter by user email (authenticated or guest)
    if (userEmail) {
      query.$or = [
        { userEmail: { $regex: userEmail, $options: "i" } },
        { guestEmail: { $regex: userEmail, $options: "i" } },
      ];
    }

    // ✅ NEW: Filter by auto-logged flag
    if (autoLogged !== null && autoLogged !== undefined) {
      query.autoLogged = autoLogged === "true";
    }

    // ✅ NEW: Filter by API endpoint
    if (apiEndpoint) {
      query.apiEndpoint = { $regex: apiEndpoint, $options: "i" };
    }

    if (search) {
      // ✅ ENHANCED: Include guestEmail in search
      query.$or = [
        { errorMessage: { $regex: search, $options: "i" } },
        { userNotes: { $regex: search, $options: "i" } },
        { apiEndpoint: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { guestEmail: { $regex: search, $options: "i" } },
      ];
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    const validSortFields = ["createdAt", "status", "errorMessage", "category", "severity"]; // ✅ ENHANCED: Added category and severity
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    sort[sortField] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute queries in parallel
    const [reports, total, statusCounts, recentCount] = await Promise.all([
      // Get paginated reports
      ErrorReport.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate("userId", "firstName lastName email")
        .populate("resolvedBy", "firstName lastName email")
        .lean(),

      // Get total count
      ErrorReport.countDocuments(query),

      // Get counts by status
      ErrorReport.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Get count of reports in last 24 hours
      ErrorReport.countDocuments({
        createdAt: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      }),
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

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      reports: reports.map((report) => ({
        ...report,
        _id: report._id
          ? typeof report._id === "object" && "toString" in report._id
            ? report._id.toString()
            : String(report._id)
          : String(report._id),
        userId: report.userId
          ? typeof report.userId === "object" && "_id" in report.userId
            ? report.userId._id.toString()
            : report.userId
          : undefined,
        resolvedBy: report.resolvedBy
          ? typeof report.resolvedBy === "object" && "_id" in report.resolvedBy
            ? report.resolvedBy._id.toString()
            : report.resolvedBy
          : undefined,
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
      },
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

