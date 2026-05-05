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

  // Phase C: optional Mongo-backed read path. Default stays "stripe" so the
  // existing behavior is preserved for any caller that doesn't opt in.
  const sourceRaw = searchParams.get("source") ?? "stripe";
  if (sourceRaw !== "stripe" && sourceRaw !== "mongo") {
    return NextResponse.json(
      { success: false, error: "Invalid source — must be 'stripe' or 'mongo'" },
      { status: 400 }
    );
  }
  const source: "stripe" | "mongo" = sourceRaw;

  try {
    if (source === "mongo") {
      const cursor = searchParams.get("cursor");
      const limitRaw = searchParams.get("limit");
      const limit = limitRaw
        ? Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 50))
        : 50;
      const result = await getAllowlistService().listBlocked(filter, { cursor, limit });
      return NextResponse.json({ success: true, ...result });
    }

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
