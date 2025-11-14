import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserAllMajorDrawEntries } from "@/utils/database/queries/major-draw-queries";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // ✅ OPTION 1: Use centralized helper function for single source of truth
    const userEntries = await getUserAllMajorDrawEntries(session.user.id);

    return NextResponse.json({
      success: true,
      data: userEntries,
    });
  } catch (error) {
    console.error("❌ Error fetching user major draw entries:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch user major draw entries",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
