/**
 * Admin Error Report Detail API
 * 
 * Handles updating individual error reports (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { ErrorReportStatus } from "@/types/error-reporting";
import User from "@/models/User";
import mongoose from "mongoose";

/**
 * Validation schema for updating an error report
 */
const updateErrorReportSchema = z.object({
  status: z.enum(["new", "investigating", "resolved", "dismissed"]).optional(),
  adminNotes: z.string().max(2000).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/error-reports/[id]
 * Get a single error report by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    // Find error report
    const report = await ErrorReport.findById(id)
      .populate("userId", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .lean();

    if (!report || Array.isArray(report)) {
      return NextResponse.json({ error: "Error report not found" }, { status: 404 });
    }

    // Type guard: ensure report is a single document, not an array
    const reportDoc = report as {
      _id: { toString(): string } | string;
      userId?: { _id: { toString(): string } | string; firstName?: string; lastName?: string; email?: string } | string | null;
      resolvedBy?: { _id: { toString(): string } | string; firstName?: string; lastName?: string; email?: string } | string | null;
      [key: string]: unknown;
    };

    return NextResponse.json({
      report: {
        ...reportDoc,
        _id: typeof reportDoc._id === "object" && "toString" in reportDoc._id
          ? reportDoc._id.toString()
          : String(reportDoc._id),
        userId: reportDoc.userId
          ? typeof reportDoc.userId === "object" && reportDoc.userId !== null && "_id" in reportDoc.userId
            ? typeof reportDoc.userId._id === "object" && "toString" in reportDoc.userId._id
              ? reportDoc.userId._id.toString()
              : String(reportDoc.userId._id)
            : typeof reportDoc.userId === "string"
            ? reportDoc.userId
            : undefined
          : undefined,
        resolvedBy: reportDoc.resolvedBy
          ? typeof reportDoc.resolvedBy === "object" && reportDoc.resolvedBy !== null && "_id" in reportDoc.resolvedBy
            ? typeof reportDoc.resolvedBy._id === "object" && "toString" in reportDoc.resolvedBy._id
              ? reportDoc.resolvedBy._id.toString()
              : String(reportDoc.resolvedBy._id)
            : typeof reportDoc.resolvedBy === "string"
            ? reportDoc.resolvedBy
            : undefined
          : undefined,
      },
    });
  } catch (error) {
    console.error("Error fetching error report:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch error report",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/error-reports/[id]
 * Update an error report status and admin notes
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateErrorReportSchema.parse(body);

    // Find error report
    const report = await ErrorReport.findById(id);
    if (!report) {
      return NextResponse.json({ error: "Error report not found" }, { status: 404 });
    }

    // Update report
    const updateData: {
      status?: ErrorReportStatus;
      adminNotes?: string;
      resolvedAt?: Date;
      resolvedBy?: mongoose.Types.ObjectId;
    } = {};

    if (validatedData.status !== undefined) {
      updateData.status = validatedData.status;

      // Set resolvedAt and resolvedBy when status changes to resolved
      if (validatedData.status === "resolved") {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = new mongoose.Types.ObjectId(session.user.id);
      }
    }

    if (validatedData.adminNotes !== undefined) {
      updateData.adminNotes = validatedData.adminNotes;
    }

    // Update the report
    Object.assign(report, updateData);
    await report.save();

    // Fetch updated report with populated fields
    const updatedReport = await ErrorReport.findById(id)
      .populate("userId", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .lean();

    if (!updatedReport || Array.isArray(updatedReport)) {
      return NextResponse.json({ error: "Error report not found after update" }, { status: 404 });
    }

    // Type guard: ensure updatedReport is a single document, not an array
    const updatedReportDoc = updatedReport as {
      _id: { toString(): string } | string;
      userId?: { _id: { toString(): string } | string; firstName?: string; lastName?: string; email?: string } | string | null;
      resolvedBy?: { _id: { toString(): string } | string; firstName?: string; lastName?: string; email?: string } | string | null;
      [key: string]: unknown;
    };

    return NextResponse.json({
      success: true,
      message: "Error report updated successfully",
      report: {
        ...updatedReportDoc,
        _id: typeof updatedReportDoc._id === "object" && "toString" in updatedReportDoc._id
          ? updatedReportDoc._id.toString()
          : String(updatedReportDoc._id),
        userId: updatedReportDoc.userId
          ? typeof updatedReportDoc.userId === "object" && updatedReportDoc.userId !== null && "_id" in updatedReportDoc.userId
            ? typeof updatedReportDoc.userId._id === "object" && "toString" in updatedReportDoc.userId._id
              ? updatedReportDoc.userId._id.toString()
              : String(updatedReportDoc.userId._id)
            : typeof updatedReportDoc.userId === "string"
            ? updatedReportDoc.userId
            : undefined
          : undefined,
        resolvedBy: updatedReportDoc.resolvedBy
          ? typeof updatedReportDoc.resolvedBy === "object" && updatedReportDoc.resolvedBy !== null && "_id" in updatedReportDoc.resolvedBy
            ? typeof updatedReportDoc.resolvedBy._id === "object" && "toString" in updatedReportDoc.resolvedBy._id
              ? updatedReportDoc.resolvedBy._id.toString()
              : String(updatedReportDoc.resolvedBy._id)
            : typeof updatedReportDoc.resolvedBy === "string"
            ? updatedReportDoc.resolvedBy
            : undefined
          : undefined,
      },
    });
  } catch (error) {
    console.error("Error updating error report:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update error report",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

