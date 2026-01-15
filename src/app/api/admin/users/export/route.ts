/**
 * Admin API: Export Users
 * 
 * GET /api/admin/users/export
 * 
 * Exports filtered users with customizable field selection in CSV or Excel format.
 * Uses the same filter logic as the main users endpoint for consistency.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { buildUserFilter } from "@/utils/admin/userFilterBuilder";
import { validateFieldKeys, getDefaultFields } from "@/services/admin/userExportFields";
import { transformUsersForExport } from "@/services/admin/userExportTransformation";
import { generateCSVResponse, generateExcelResponse } from "@/services/admin/userExportFormats";
import { formatDateInAEST } from "@/utils/common/timezone";

/**
 * GET handler for exporting users
 * 
 * Query params:
 * - format: 'csv' | 'excel' (default: 'csv')
 * - fields: Comma-separated list of field keys to include (optional, defaults to default fields)
 * - All filter parameters from users endpoint (search, subscriptionStatus, membershipPackage, role, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Get format (default to CSV)
    const format = (searchParams.get("format") || "csv").toLowerCase();
    if (format !== "csv" && format !== "excel") {
      return NextResponse.json({ error: "Invalid format. Must be 'csv' or 'excel'" }, { status: 400 });
    }

    // Get selected fields
    const fieldsParam = searchParams.get("fields");
    let selectedFields: string[];
    if (fieldsParam) {
      selectedFields = fieldsParam.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
    } else {
      // Use default fields if not specified
      selectedFields = getDefaultFields();
    }

    // Validate field keys
    const validation = validateFieldKeys(selectedFields);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid field keys: ${validation.invalidKeys.join(", ")}` },
        { status: 400 }
      );
    }

    // Extract filter parameters
    const filters = {
      search: searchParams.get("search") || "",
      subscriptionStatus: searchParams.get("subscriptionStatus") || "",
      autoRenew: searchParams.get("autoRenew") || "",
      membershipPackage: searchParams.get("membershipPackage") || "",
      role: searchParams.get("role") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    };

    // Build filter using the same logic as main users endpoint
    const filter = await buildUserFilter(filters);

    // Fetch ALL matching users (not paginated) when exporting
    const users = await User.find(filter)
      .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
      .lean();

    if (users.length === 0) {
      return NextResponse.json(
        { error: "No users found matching the selected filters" },
        { status: 404 }
      );
    }

    // Transform user data for export
    // Type assertion needed to match MongoDB lean() return type with our interface
    const transformedData = await transformUsersForExport(users as unknown as import("@/services/admin/userExportTransformation").UserLeanDocument[], selectedFields);

    // Generate filename with timestamp and filter summary
    const dateStr = formatDateInAEST(new Date(), "yyyy-MM-dd");
    const timeStr = formatDateInAEST(new Date(), "HHmmss");
    const filterSummary = [];
    
    if (filters.subscriptionStatus) filterSummary.push(filters.subscriptionStatus);
    if (filters.membershipPackage) filterSummary.push(filters.membershipPackage.replace(/[^a-zA-Z0-9]/g, "-"));
    if (filters.role) filterSummary.push(filters.role);
    
    const filterSuffix = filterSummary.length > 0 ? `-${filterSummary.join("-")}` : "";
    const baseFilename = `users-export-${dateStr}-${timeStr}${filterSuffix}`;

    // Generate file based on format
    if (format === "excel") {
      return await generateExcelResponse(transformedData, selectedFields, baseFilename);
    } else {
      return generateCSVResponse(transformedData, selectedFields, baseFilename);
    }
  } catch (error) {
    console.error("Error exporting users:", error);
    return NextResponse.json(
      {
        error: "Failed to export users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

