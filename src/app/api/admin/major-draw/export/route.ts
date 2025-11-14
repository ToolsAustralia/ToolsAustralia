/**
 * Admin API: Export Major Draw Participants
 *
 * GET /api/admin/major-draw/export?format=csv|excel&majorDrawId=xxx
 *
 * Exports all participants of a major draw with their entry counts.
 * Accessible to admins at any time for any draw.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import User from "@/models/User";
import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { formatDateInAEST } from "@/utils/common/timezone";

// Type for populated user data
interface PopulatedUser {
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
}

// Australian state abbreviation to full name mapping
const STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

/**
 * GET handler for exporting major draw participants
 *
 * Query params:
 * - format: 'csv' | 'excel' (default: 'csv')
 * - majorDrawId: Optional - if not provided, exports current active draw
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "csv";
    const majorDrawId = searchParams.get("majorDrawId");

    // Get major draw
    let majorDraw: IMajorDraw | null;
    if (majorDrawId) {
      majorDraw = await MajorDraw.findById(majorDrawId);
    } else {
      // Get current active or frozen draw
      majorDraw = await MajorDraw.findOne({
        status: { $in: ["active", "frozen", "completed"] },
      }).sort({ activationDate: -1 });
    }

    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // Don't allow export of cancelled draws
    if (majorDraw.status === "cancelled") {
      return NextResponse.json(
        {
          error: "Cannot export cancelled draw",
        },
        { status: 403 }
      );
    }

    // Populate user details directly from entries field
    await majorDraw.populate({
      path: "entries.userId",
      select: "firstName lastName email mobile state",
      model: User,
    });

    // Build export data from populated entries
    const exportData = majorDraw.entries
      .map((entry, index) => {
        const user = entry.userId as unknown as PopulatedUser; // Populated user object
        const stateAbbr = (user?.state || "").toUpperCase().trim(); // Ensure uppercase and trimmed
        const stateName = STATE_NAMES[stateAbbr] || user?.state || ""; // Convert to full name or keep original

        // Debug log for first entry
        if (index === 0) {
          console.log("🔍 Export Debug - First Entry:");
          console.log("  - Raw state value:", user?.state);
          console.log("  - State abbr (processed):", stateAbbr);
          console.log("  - Mapped state name:", stateName);
          console.log("  - STATE_NAMES object:", STATE_NAMES);
          console.log("  - Lookup result:", STATE_NAMES[stateAbbr]);
        }

        return {
          firstName: user?.firstName || "",
          lastName: user?.lastName || "",
          email: user?.email || "",
          mobile: user?.mobile || "",
          state: stateName,
          totalEntries: entry.totalEntries,
        };
      })
      .sort((a, b) => b.totalEntries - a.totalEntries); // Sort by entries descending

    // Generate filename with draw name and date
    const drawName = majorDraw.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const dateStr = formatDateInAEST(new Date(), "yyyy-MM-dd");
    const baseFilename = `major-draw-export-${drawName}-${dateStr}`;

    // Export based on format
    if (format === "excel") {
      return await exportToExcel(exportData, majorDraw, baseFilename);
    } else {
      return exportToCSV(exportData, baseFilename);
    }
  } catch (error) {
    console.error("Error exporting major draw:", error);
    return NextResponse.json(
      {
        error: "Failed to export major draw data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Export data to CSV format
 */
function exportToCSV(
  data: Array<{
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    state: string;
    totalEntries: number;
  }>,
  filename: string
): NextResponse {
  // Define CSV headers
  const headers = ["First Name", "Last Name", "Email", "Mobile", "State", "Total Entries"];

  // Convert data to CSV format
  const csvData = data.map((row) => [
    row.firstName,
    row.lastName,
    row.email,
    row.mobile,
    row.state,
    row.totalEntries.toString(),
  ]);

  // Generate CSV string
  const csv = stringify([headers, ...csvData], {
    quoted: true,
    quoted_empty: true,
  });

  // Return CSV response with proper headers
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Export data to Excel format
 */
async function exportToExcel(
  data: Array<{
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    state: string;
    totalEntries: number;
  }>,
  majorDraw: IMajorDraw,
  filename: string
): Promise<NextResponse> {
  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Major Draw Entries");

  // Set column definitions with proper widths
  worksheet.columns = [
    { header: "First Name", key: "firstName", width: 20 },
    { header: "Last Name", key: "lastName", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Mobile", key: "mobile", width: 18 },
    { header: "State", key: "state", width: 10 },
    { header: "Total Entries", key: "totalEntries", width: 15 },
  ];

  // Style the header row
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9D9D9" },
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getRow(1).border = {
    bottom: { style: "thin" },
  };

  // Add data rows
  data.forEach((row) => {
    worksheet.addRow(row);
  });

  // Add summary information at the bottom
  const summaryRowNum = data.length + 3;
  worksheet.getCell(`A${summaryRowNum}`).value = "Total Participants:";
  worksheet.getCell(`A${summaryRowNum}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum}`).value = data.length;

  worksheet.getCell(`A${summaryRowNum + 1}`).value = "Total Entries:";
  worksheet.getCell(`A${summaryRowNum + 1}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 1}`).value = majorDraw.totalEntries;

  worksheet.getCell(`A${summaryRowNum + 2}`).value = "Draw Name:";
  worksheet.getCell(`A${summaryRowNum + 2}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 2}`).value = majorDraw.name;

  worksheet.getCell(`A${summaryRowNum + 3}`).value = "Draw Date:";
  worksheet.getCell(`A${summaryRowNum + 3}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 3}`).value = majorDraw.drawDate
    ? formatDateInAEST(majorDraw.drawDate, "MMM dd, yyyy h:mm a")
    : "Not set";

  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Return Excel response with proper headers
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-cache",
    },
  });
}
