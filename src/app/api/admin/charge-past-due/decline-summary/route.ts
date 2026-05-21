import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
  summariseDeclineCodes,
} from "@/services/admin/chargePastDueHistory";

export async function GET(request: NextRequest) {
  const guard = await requirePermission("users.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const summary = await summariseDeclineCodes({
    startDate: parseAestDayStartUtc(searchParams.get("startDate")),
    endDate: parseAestDayEndExclusiveUtc(searchParams.get("endDate")),
  });

  return NextResponse.json(summary);
}
