/**
 * Admin API: Export Users
 *
 * GET /api/admin/users/export
 *
 * Exports filtered users with customizable field selection in CSV or Excel format.
 * Uses the same filter logic as the main users endpoint for consistency.
 *
 * Segment export (segment=top20MajorDraw): Exports the top 20% of users by major draw
 * entry count in the active draw. Includes all users tied at the threshold.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  buildUserFilter,
  resolveTop20MajorDrawSegment,
  TOP20_MAJOR_DRAW_SEGMENT,
} from "@/utils/admin/userFilterBuilder";
import { validateFieldKeys, getDefaultFields } from "@/services/admin/userExportFields";
import {
  transformUsersForExport,
  type UserLeanDocument,
} from "@/services/admin/userExportTransformation";
import { generateCSVResponse, generateExcelResponse } from "@/services/admin/userExportFormats";
import { formatDateInAEST } from "@/utils/common/timezone";

/**
 * GET handler for exporting users
 *
 * Query params:
 * - format: 'csv' | 'excel' (default: 'csv')
 * - fields: Comma-separated list of field keys to include (optional, defaults to default fields)
 * - segment: 'top20MajorDraw' = export top 20% of users by major draw entry count (ignores filters)
 * - All filter parameters (search, subscriptionStatus, membershipPackage, role, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("users.export");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);

    const format = (searchParams.get("format") || "csv").toLowerCase();
    if (format !== "csv" && format !== "excel") {
      return NextResponse.json({ error: "Invalid format. Must be 'csv' or 'excel'" }, { status: 400 });
    }

    const fieldsParam = searchParams.get("fields");
    let selectedFields: string[];
    if (fieldsParam) {
      selectedFields = fieldsParam.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
    } else {
      selectedFields = getDefaultFields();
    }

    const validation = validateFieldKeys(selectedFields);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid field keys: ${validation.invalidKeys.join(", ")}` },
        { status: 400 }
      );
    }

    const segment = searchParams.get("segment") || "";
    let users: UserLeanDocument[];

    if (segment === TOP20_MAJOR_DRAW_SEGMENT) {
      // --- Top 20% active major draw entry holders ---
      // Shared resolver (ties included — see resolveTop20MajorDrawSegment). This block used to
      // hand-roll the same maths, and the copy in `aggregateUserExport` had already drifted from
      // it, so the Norm aggregate and this CSV could disagree about who "top 20%" meant.
      const top20 = await resolveTop20MajorDrawSegment();
      if (!top20) {
        return NextResponse.json(
          { error: "No active major draw found, or no entries in the current draw" },
          { status: 404 }
        );
      }
      const topUserIds = top20.userIds;

      if (topUserIds.length === 0) {
        return NextResponse.json(
          { error: "No users with major draw entries found" },
          { status: 404 }
        );
      }

      const rawUsers = await User.find({ _id: { $in: topUserIds } })
        .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
        .lean();
      users = rawUsers as unknown as UserLeanDocument[];

      // Preserve sort order (highest entries first)
      const idToOrder = new Map(topUserIds.map((id, i) => [id, i]));
      (users as Array<Record<string, unknown>>).sort((a, b) => {
        const aId = (a._id as { toString: () => string }).toString();
        const bId = (b._id as { toString: () => string }).toString();
        return (idToOrder.get(aId) ?? 999) - (idToOrder.get(bId) ?? 999);
      });
    } else {
      // --- Standard filtered export ---
      const stateList = searchParams.getAll("state").map((s) => s.trim()).filter(Boolean);
      const filters = {
        search: searchParams.get("search") || "",
        subscriptionStatus: searchParams.get("subscriptionStatus") || "",
        autoRenew: searchParams.get("autoRenew") || "",
        membershipPackage: searchParams.get("membershipPackage") || "",
        role: searchParams.get("role") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
        states: stateList,
        inActiveMajorDraw: searchParams.get("inActiveMajorDraw") || "",
        miniDrawPackage: searchParams.get("miniDrawPackage") || "",
        inActiveMiniDraw: searchParams.get("inActiveMiniDraw") || "",
        streak: searchParams.get("streak") || "",
      };
      const filter = await buildUserFilter(filters);
      const rawUsers = await User.find(filter)
        .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
        .lean();
      users = rawUsers as unknown as UserLeanDocument[];

      if (users.length === 0) {
        return NextResponse.json(
          { error: "No users found matching the selected filters" },
          { status: 404 }
        );
      }
    }

    const transformedData = await transformUsersForExport(users, selectedFields);

    const dateStr = formatDateInAEST(new Date(), "yyyy-MM-dd");
    const timeStr = formatDateInAEST(new Date(), "HHmmss");
    const filterSummary: string[] = [];
    if (segment === TOP20_MAJOR_DRAW_SEGMENT) {
      filterSummary.push("top20-major-draw");
    } else {
      const sub = searchParams.get("subscriptionStatus") || "";
      const pkg = searchParams.get("membershipPackage") || "";
      const role = searchParams.get("role") || "";
      const stList = searchParams.getAll("state").map((s) => s.trim()).filter(Boolean);
      const inDraw = searchParams.get("inActiveMajorDraw") || "";
      if (sub) filterSummary.push(sub);
      if (pkg) filterSummary.push(pkg.replace(/[^a-zA-Z0-9]/g, "-"));
      if (role) filterSummary.push(role);
      if (stList.length) filterSummary.push(stList.map((s) => s.toLowerCase()).join("-"));
      if (inDraw) filterSummary.push(inDraw === "yes" ? "in-draw" : "not-in-draw");
      const miniPack = searchParams.get("miniDrawPackage") || "";
      const inMini = searchParams.get("inActiveMiniDraw") || "";
      if (miniPack) filterSummary.push(miniPack === "yes" ? "mini-pack-buyers" : "no-mini-pack");
      if (inMini) filterSummary.push(inMini === "yes" ? "in-mini-draw" : "not-in-mini-draw");
    }
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

