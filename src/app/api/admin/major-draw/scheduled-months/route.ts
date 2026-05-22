import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";

export async function GET() {
  try {
    const _guard = await requirePermission("majorDraw.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    console.log("📅 Fetching scheduled draw months...");

    // Get all draws that have scheduled draw dates (including completed ones)
    const scheduledDraws = await MajorDraw.find({
      drawDate: { $exists: true, $ne: null },
      status: { $in: ["queued", "active", "frozen", "completed"] },
    }).select("drawDate name status");

    // Extract unique months/years that have scheduled draws
    const scheduledMonths = new Set<string>();

    scheduledDraws.forEach((draw) => {
      if (draw.drawDate) {
        const date = new Date(draw.drawDate);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        scheduledMonths.add(monthKey);
      }
    });

    // Convert to array and format for frontend
    const restrictedMonths = Array.from(scheduledMonths).map((monthKey) => {
      const [year, month] = monthKey.split("-");
      return {
        year: parseInt(year),
        month: parseInt(month), // 0-based month (0 = January, 11 = December)
        monthName: new Date(parseInt(year), parseInt(month), 1).toLocaleDateString("en-US", { month: "long" }),
      };
    });

    console.log("✅ Found scheduled months:", restrictedMonths);
    console.log(
      "📅 Scheduled draws data:",
      scheduledDraws.map((draw) => ({
        id: draw._id,
        name: draw.name,
        drawDate: draw.drawDate,
        status: draw.status,
      }))
    );

    return NextResponse.json({
      success: true,
      data: {
        restrictedMonths,
        scheduledDraws: scheduledDraws.map((draw) => ({
          id: draw._id,
          name: draw.name,
          drawDate: draw.drawDate,
          status: draw.status,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching scheduled draw months:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch scheduled draw months",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
