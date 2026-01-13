import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ExperimentService from "@/services/ab-testing/ExperimentService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/ab-testing/experiments/[id]/history
 * Get experiment history/audit log
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: experimentId } = await params;
    const history = await ExperimentService.getExperimentHistory(experimentId);

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching experiment history:", error);
    return NextResponse.json({ error: "Failed to fetch experiment history" }, { status: 500 });
  }
}

