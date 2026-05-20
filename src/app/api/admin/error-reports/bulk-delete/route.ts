/**
 * Bulk Delete Error Reports API
 * 
 * Handles bulk deletion of error reports (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import mongoose from "mongoose";

const bulkDeleteSchema = z.object({
  reportIds: z.array(z.string().min(1)).min(1, "At least one report ID is required"),
  reason: z.string().max(500).optional(),
});

const bulkStatusSchema = z.object({
  reportIds: z.array(z.string().min(1)).min(1, "At least one report ID is required"),
  status: z.enum(["new", "investigating", "resolved", "dismissed"]),
  adminNotes: z.string().max(2000).optional(),
});

/**
 * DELETE /api/admin/error-reports/bulk-delete
 * Delete multiple error reports by IDs
 */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requirePermission("errorReports.edit");
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    await connectDB();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const validatedData = bulkDeleteSchema.parse(body);

    const objectIds = validatedData.reportIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (objectIds.length !== validatedData.reportIds.length) {
      return NextResponse.json({ error: "One or more report IDs are invalid" }, { status: 400 });
    }

    // Soft archive reports instead of hard-deleting diagnostic history.
    const archiveResult = await ErrorReport.updateMany({
      _id: { $in: objectIds },
    }, {
      $set: {
        status: "dismissed",
        archivedAt: new Date(),
        archivedBy: new mongoose.Types.ObjectId(session.user.id),
        archiveReason: validatedData.reason || "Archived from admin bulk action",
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: archiveResult.modifiedCount,
      archivedCount: archiveResult.modifiedCount,
      message: `Archived ${archiveResult.modifiedCount} error report(s)`,
    });
  } catch (error) {
    console.error("Error bulk deleting error reports:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to delete error reports",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/error-reports/bulk-delete
 * Bulk update report workflow status.
 */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requirePermission("errorReports.edit");
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    await connectDB();

    const body = await request.json().catch(() => ({}));
    const validatedData = bulkStatusSchema.parse(body);
    const objectIds = validatedData.reportIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (objectIds.length !== validatedData.reportIds.length) {
      return NextResponse.json({ error: "One or more report IDs are invalid" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      status: validatedData.status,
      updatedAt: new Date(),
    };

    if (validatedData.adminNotes !== undefined) {
      updateData.adminNotes = validatedData.adminNotes;
    }

    if (validatedData.status === "resolved") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = new mongoose.Types.ObjectId(session.user.id);
    } else {
      updateData.$unset = { resolvedAt: "", resolvedBy: "" };
    }

    if (validatedData.status !== "dismissed") {
      updateData.$unset = {
        ...((updateData.$unset as Record<string, string> | undefined) || {}),
        archivedAt: "",
        archivedBy: "",
        archiveReason: "",
      };
    }

    const { $unset, ...setData } = updateData;
    const update = $unset ? { $set: setData, $unset } : { $set: setData };
    const updateResult = await ErrorReport.updateMany({ _id: { $in: objectIds } }, update);

    return NextResponse.json({
      success: true,
      updatedCount: updateResult.modifiedCount,
      message: `Updated ${updateResult.modifiedCount} error report(s)`,
    });
  } catch (error) {
    console.error("Error bulk updating error reports:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update error reports",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}
