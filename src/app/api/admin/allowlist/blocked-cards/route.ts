import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";
import type { BlockedFilter } from "@/services/allowlist/types";

// Stripe's paymentIntents.list cannot filter by outcome, so this route
// paginates every PI in the date window — on a busy account that can run
// well past Vercel's default 10-15s function timeout. The service caps the
// scan internally; this maxDuration just gives it room to finish.
export const maxDuration = 60;

function parseDateOrDefault(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filter: BlockedFilter = {
    dateFrom: parseDateOrDefault(searchParams.get("dateFrom"), thirtyDaysAgo),
    dateTo: parseDateOrDefault(searchParams.get("dateTo"), now),
    memberStatus:
      (searchParams.get("memberStatus") as BlockedFilter["memberStatus"]) ?? "any",
    declineReason:
      (searchParams.get("declineReason") as BlockedFilter["declineReason"]) ?? "any",
    skippedOnly: searchParams.get("skippedOnly") === "true",
  };

  try {
    const result = await getAllowlistService().listBlockedFromStripe(filter);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to list blocked cards",
      },
      { status: 500 }
    );
  }
}
