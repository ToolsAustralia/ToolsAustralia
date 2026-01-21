/**
 * Bulk Delete Error Reports API
 * 
 * Handles bulk deletion of error reports (admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import User from "@/models/User";

const bulkDeleteSchema = z.object({
  reportIds: z.array(z.string().min(1)).min(1, "At least one report ID is required"),
});

/**
 * DELETE /api/admin/error-reports/bulk-delete
 * Delete multiple error reports by IDs
 */
export async function DELETE(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const validatedData = bulkDeleteSchema.parse(body);

    // Delete reports
    const deleteResult = await ErrorReport.deleteMany({
      _id: { $in: validatedData.reportIds },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.deletedCount,
      message: `Successfully deleted ${deleteResult.deletedCount} error report(s)`,
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
