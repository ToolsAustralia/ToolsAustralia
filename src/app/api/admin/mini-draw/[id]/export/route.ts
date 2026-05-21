import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import User from "@/models/User";
import { Types } from "mongoose";
import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { formatDateInAEST } from "@/utils/common/timezone";

/**
 * GET /api/admin/mini-draw/[id]/export
 * Export mini draw participants as CSV or Excel
 */

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
    }

    // Find the mini draw
    const miniDraw = await MiniDraw.findById(id);
    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Get all users who have entries in this mini draw (package-only; no member entries)
    const userIds = miniDraw.entries.map((entry: { userId: Types.ObjectId }) => entry.userId);
    const existingUsers = await User.find({ _id: { $in: userIds } })
      .select("firstName lastName email mobile state")
      .lean();

    const existingUserMap = new Map(
      existingUsers.map((user) => [(user._id as unknown as Types.ObjectId).toString(), user])
    );

    // Export only participants in miniDraw.entries with package-only totalEntries
    const exportEntriesMap = new Map<string, MiniDrawExportRow>();

    miniDraw.entries.forEach(
      (entry: {
        userId: Types.ObjectId;
        totalEntries: number;
        firstAddedDate?: Date;
        lastUpdatedDate?: Date;
      }) => {
        const user = existingUserMap.get(entry.userId.toString());
        if (!user) return;

        const stateAbbr = (user?.state || "").toUpperCase().trim();
        const stateName = STATE_NAMES[stateAbbr] || user?.state || "";

        exportEntriesMap.set(entry.userId.toString(), {
          firstName: user?.firstName || "",
          lastName: user?.lastName || "",
          email: user?.email || "",
          mobile: user?.mobile || "",
          state: stateName,
          totalEntries: entry.totalEntries,
        });
      }
    );

    const exportData = Array.from(exportEntriesMap.values()).sort((a, b) => b.totalEntries - a.totalEntries);

    const safeName = miniDraw.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const dateStr = formatDateInAEST(new Date(), "yyyy-MM-dd");
    const baseFilename = `mini-draw-export-${safeName}-${dateStr}`;

    if (format === "excel") {
      return await generateExcelResponse(exportData, miniDraw, baseFilename);
    }

    return generateCSVResponse(exportData, baseFilename);
  } catch (error) {
    console.error("❌ Error exporting mini draw:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to export mini draw",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Export row type matching majordraw export structure
 * Simplified to only include essential participant information
 */
type MiniDrawExportRow = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  state: string;
  totalEntries: number;
};

/**
 * Export data to CSV format
 * Matches majordraw export structure with simplified columns
 */
function generateCSVResponse(data: MiniDrawExportRow[], filename: string): NextResponse {
  // Define CSV headers matching majordraw export
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

  // Generate CSV string with BOM and CRLF for Excel compatibility on Windows
  const csv = stringify([headers, ...csvData], {
    quoted: true,
    quoted_empty: true,
    bom: true,
    record_delimiter: "windows",
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
 * Matches majordraw export structure with simplified columns
 */
async function generateExcelResponse(
  data: MiniDrawExportRow[],
  miniDraw: { name: string; totalEntries?: number; minimumEntries?: number; entries: unknown[] },
  filename: string
): Promise<NextResponse> {
  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Mini Draw Entries");

  // Set column definitions with proper widths (matching majordraw export)
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
  worksheet.getCell(`B${summaryRowNum + 1}`).value =
    miniDraw.totalEntries ?? data.reduce((sum, row) => sum + row.totalEntries, 0);

  worksheet.getCell(`A${summaryRowNum + 2}`).value = "Draw Name:";
  worksheet.getCell(`A${summaryRowNum + 2}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 2}`).value = miniDraw.name;

  worksheet.getCell(`A${summaryRowNum + 3}`).value = "Minimum Entries:";
  worksheet.getCell(`A${summaryRowNum + 3}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 3}`).value = miniDraw.minimumEntries ?? "Not set";

  worksheet.getCell(`A${summaryRowNum + 4}`).value = "Entries Remaining:";
  worksheet.getCell(`A${summaryRowNum + 4}`).font = { bold: true };
  worksheet.getCell(`B${summaryRowNum + 4}`).value = Math.max(
    (miniDraw.minimumEntries ?? 0) - (miniDraw.totalEntries ?? 0),
    0
  );

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
