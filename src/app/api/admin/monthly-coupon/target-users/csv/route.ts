import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { CsvImportService, TargetingService } from "@/services/redeemables";

const csvSchema = z.object({
  csvText: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();
    const body = await request.json();
    const payload = csvSchema.parse(body);

    const parsed = CsvImportService.parseUserIdentifiers(payload.csvText);
    const userIds = await TargetingService.resolveTargetUserIds({
      targetingMode: "csv-users",
      csvUserIds: parsed.userIds,
    });

    return NextResponse.json({
      success: true,
      data: {
        userIds,
        count: userIds.length,
        invalidRows: parsed.invalidRows,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    console.error("Error resolving CSV target users:", error);
    return NextResponse.json({ success: false, error: "Failed to resolve CSV target users" }, { status: 500 });
  }
}
