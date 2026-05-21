import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";

/**
 * GET /api/admin/mini-draw/full-capacity-count
 * Get count of mini draws at 100% (status completed) needing winner selection
 */
export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await MiniDraw.countDocuments({ status: "completed" });

    return NextResponse.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error("Error fetching mini draw full capacity count:", error);
    return NextResponse.json(
      { error: "Failed to fetch full capacity count" },
      { status: 500 }
    );
  }
}
