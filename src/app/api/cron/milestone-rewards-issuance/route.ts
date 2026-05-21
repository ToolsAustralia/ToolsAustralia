import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { MilestoneService } from "@/services/milestones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const result = await MilestoneService.evaluateAllUsersAndIssueMilestones();

    return NextResponse.json({
      success: true,
      data: result,
      message: "Milestone rewards issuance run completed",
    });
  } catch (error) {
    console.error("Milestone rewards cron failed:", error);
    return NextResponse.json({ success: false, error: "Milestone rewards cron failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Milestone Rewards Issuance Cron",
    status: "healthy",
    message: "Use POST to evaluate and issue milestone rewards",
  });
}
