/**
 * Admin Error Report Detail API
 * 
 * Handles updating individual error reports (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { z } from "zod";
import { ErrorReportStatus } from "@/types/error-reporting";
import mongoose from "mongoose";
import { getErrorReportById } from "@/services/error-reporting/ErrorReportQueryService";

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
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const _guard = await requirePermission("errorReports.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    const report = await getErrorReportById(id);
    if (!report) {
      return NextResponse.json({ error: "Error report not found" }, { status: 404 });
    }

    return NextResponse.json({ report });
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
    const { id } = await params;
    const guard = await requirePermissionWithAudit("errorReports.edit", request, {
      resourceType: "ErrorReport",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;

    const { session, log } = guard;
    await connectDB();

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
      $unset?: {
        resolvedAt?: string;
        resolvedBy?: string;
        archivedAt?: string;
        archivedBy?: string;
        archiveReason?: string;
      };
    } = {};

    if (validatedData.status !== undefined) {
      updateData.status = validatedData.status;

      // Set resolvedAt and resolvedBy when status changes to resolved
      if (validatedData.status === "resolved") {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = new mongoose.Types.ObjectId(session.user.id);
      } else {
        updateData.$unset = {
          ...(updateData.$unset || {}),
          resolvedAt: "",
          resolvedBy: "",
        };
      }

      if (validatedData.status !== "dismissed") {
        updateData.$unset = {
          ...(updateData.$unset || {}),
          archivedAt: "",
          archivedBy: "",
          archiveReason: "",
        };
      }
    }

    if (validatedData.adminNotes !== undefined) {
      updateData.adminNotes = validatedData.adminNotes;
    }

    const { $unset, ...setData } = updateData;
    await ErrorReport.updateOne(
      { _id: report._id },
      $unset ? { $set: setData, $unset } : { $set: setData }
    );

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

    await log(200);
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

