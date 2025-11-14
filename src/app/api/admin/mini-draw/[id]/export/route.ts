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

    // Get all users who have entries in this mini draw
    const userIds = miniDraw.entries.map((entry: { userId: Types.ObjectId }) => entry.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select("firstName lastName email mobile state")
      .lean();

    // Create a map of user data for quick lookup
    const userMap = new Map(users.map((user) => [(user._id as unknown as Types.ObjectId).toString(), user]));

    // Prepare export data sorted by total entries (desc)
    const exportData = miniDraw.entries
      .map(
        (entry: {
          userId: Types.ObjectId;
          totalEntries: number;
          entriesBySource?: { "mini-draw-package"?: number; "free-entry"?: number };
          firstAddedDate?: Date;
          lastUpdatedDate?: Date;
        }) => {
          const user = userMap.get(entry.userId.toString());
          const stateAbbr = (user?.state || "").toUpperCase().trim();
          const stateName = STATE_NAMES[stateAbbr] || user?.state || "";

          return {
            firstName: user?.firstName || "",
            lastName: user?.lastName || "",
            email: user?.email || "",
            mobile: user?.mobile || "",
            state: stateName,
            totalEntries: entry.totalEntries,
            entriesFromPackages: entry.entriesBySource?.["mini-draw-package"] || 0,
            entriesFromFree: entry.entriesBySource?.["free-entry"] || 0,
            firstAddedDate: entry.firstAddedDate ?? null,
            lastUpdatedDate: entry.lastUpdatedDate ?? null,
          };
        }
      )
      .sort((a: MiniDrawExportRow, b: MiniDrawExportRow) => b.totalEntries - a.totalEntries);

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

type MiniDrawExportRow = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  state: string;
  totalEntries: number;
  entriesFromPackages: number;
  entriesFromFree: number;
  firstAddedDate: Date | null;
  lastUpdatedDate: Date | null;
};

function generateCSVResponse(data: MiniDrawExportRow[], filename: string): NextResponse {
  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Mobile",
    "State",
    "Total Entries",
    "Entries from Packages",
    "Entries from Free",
    "First Added Date",
    "Last Updated Date",
  ];

  const csvData = data.map((row) => [
    row.firstName,
    row.lastName,
    row.email,
    row.mobile,
    row.state,
    row.totalEntries.toString(),
    row.entriesFromPackages.toString(),
    row.entriesFromFree.toString(),
    row.firstAddedDate ? row.firstAddedDate.toISOString() : "",
    row.lastUpdatedDate ? row.lastUpdatedDate.toISOString() : "",
  ]);

  const csvContent = stringify([headers, ...csvData], {
    quoted: true,
    quoted_empty: true,
  });

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-cache",
    },
  });
}

async function generateExcelResponse(
  data: MiniDrawExportRow[],
  miniDraw: { name: string; totalEntries?: number; minimumEntries?: number; entries: unknown[] },
  filename: string
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Mini Draw Entries");

  worksheet.columns = [
    { header: "First Name", key: "firstName", width: 20 },
    { header: "Last Name", key: "lastName", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Mobile", key: "mobile", width: 18 },
    { header: "State", key: "state", width: 18 },
    { header: "Total Entries", key: "totalEntries", width: 15 },
    { header: "Entries from Packages", key: "entriesFromPackages", width: 22 },
    { header: "Entries from Free", key: "entriesFromFree", width: 20 },
    { header: "First Added", key: "firstAddedDate", width: 24 },
    { header: "Last Updated", key: "lastUpdatedDate", width: 24 },
  ];

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

  data.forEach((row) => {
    worksheet.addRow({
      ...row,
      firstAddedDate: row.firstAddedDate ? formatDateInAEST(row.firstAddedDate, "MMM dd, yyyy h:mm a") : "",
      lastUpdatedDate: row.lastUpdatedDate ? formatDateInAEST(row.lastUpdatedDate, "MMM dd, yyyy h:mm a") : "",
    });
  });

  const summaryStart = data.length + 3;
  worksheet.getCell(`A${summaryStart}`).value = "Total Participants:";
  worksheet.getCell(`A${summaryStart}`).font = { bold: true };
  worksheet.getCell(`B${summaryStart}`).value = data.length;

  worksheet.getCell(`A${summaryStart + 1}`).value = "Total Entries:";
  worksheet.getCell(`A${summaryStart + 1}`).font = { bold: true };
  worksheet.getCell(`B${summaryStart + 1}`).value =
    miniDraw.totalEntries ?? data.reduce((sum, row) => sum + row.totalEntries, 0);

  worksheet.getCell(`A${summaryStart + 2}`).value = "Draw Name:";
  worksheet.getCell(`A${summaryStart + 2}`).font = { bold: true };
  worksheet.getCell(`B${summaryStart + 2}`).value = miniDraw.name;

  worksheet.getCell(`A${summaryStart + 3}`).value = "Minimum Entries:";
  worksheet.getCell(`A${summaryStart + 3}`).font = { bold: true };
  worksheet.getCell(`B${summaryStart + 3}`).value = miniDraw.minimumEntries ?? "Not set";

  worksheet.getCell(`A${summaryStart + 4}`).value = "Entries Remaining:";
  worksheet.getCell(`A${summaryStart + 4}`).font = { bold: true };
  worksheet.getCell(`B${summaryStart + 4}`).value = Math.max(
    (miniDraw.minimumEntries ?? 0) - (miniDraw.totalEntries ?? 0),
    0
  );

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-cache",
    },
  });
}
