import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import AllowlistAction from "@/models/AllowlistAction";

/**
 * GET /api/admin/allowlist/stats
 *
 * Returns the count of cards currently on the Stripe allowlist — defined as
 * fingerprints whose most-recent AllowlistAction has `action: "added"`.
 * Drives the "Total on allowlist" metric card on /admin/blocked-transactions.
 *
 * Source-of-truth note: Stripe's `card_fingerprint_allowlist` Radar value list
 * is the live allowlist; AllowlistAction is our audit log. This count
 * approximates the live list (drift is bounded by reverse() failures, which
 * are vanishingly rare in practice).
 */
export async function GET() {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  try {
    const result = await AllowlistAction.aggregate<{
      totalActiveAllowlisted: number;
    }>([
      { $sort: { cardFingerprint: 1, createdAt: -1 } },
      { $group: { _id: "$cardFingerprint", latest: { $first: "$action" } } },
      { $match: { latest: "added" } },
      { $count: "totalActiveAllowlisted" },
    ]);
    const total = result[0]?.totalActiveAllowlisted ?? 0;
    return NextResponse.json({ success: true, totalActiveAllowlisted: total });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to compute allowlist stats",
      },
      { status: 500 }
    );
  }
}
