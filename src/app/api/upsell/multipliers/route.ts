import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig from "@/models/UpsellMultiplierConfig";

/**
 * GET /api/upsell/multipliers
 *
 * Returns the three admin-configured upsell category multipliers. Public — no auth.
 * Used by the client-side UpsellModal to compute the EFFECTIVE multiplier
 * (`activePromo × upsellCategoryMultiplier`) for image variant selection.
 *
 * Writes still require admin via /api/admin/upsell-multipliers.
 */
export async function GET() {
  try {
    await connectDB();
    const config = await UpsellMultiplierConfig.getOrCreate();
    return NextResponse.json({
      membership: config.membership,
      oneTime: config.oneTime,
      additional: config.additional,
    });
  } catch (error) {
    console.error("Failed to load upsell multipliers:", error);
    // Fall back to spec defaults so the modal still renders sensibly.
    return NextResponse.json(
      { membership: 10, oneTime: 2, additional: 2 },
      { status: 200 }
    );
  }
}
