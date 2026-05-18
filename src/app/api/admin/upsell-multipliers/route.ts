import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig from "@/models/UpsellMultiplierConfig";
import { zPromoMultiplier } from "@/lib/zod/promo-multiplier-schema";
import mongoose from "mongoose";

const updateSchema = z.object({
  membership: zPromoMultiplier,
  oneTime: zPromoMultiplier,
  additional: zPromoMultiplier,
});

/**
 * GET /api/admin/upsell-multipliers
 * Returns the current upsell multiplier triple (membership, oneTime, additional) + updatedAt.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const config = await UpsellMultiplierConfig.getOrCreate();

    return NextResponse.json({
      membership: config.membership,
      oneTime: config.oneTime,
      additional: config.additional,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching upsell multiplier config:", error);
    return NextResponse.json(
      { error: "Failed to fetch upsell multiplier configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/upsell-multipliers
 * Persists a new multiplier triple. Records the admin user who made the change.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectDB();
    const config = await UpsellMultiplierConfig.getOrCreate();
    config.membership = parsed.data.membership;
    config.oneTime = parsed.data.oneTime;
    config.additional = parsed.data.additional;
    config.updatedBy = new mongoose.Types.ObjectId(session.user.id);
    await config.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating upsell multiplier config:", error);
    return NextResponse.json(
      { error: "Failed to update upsell multiplier configuration" },
      { status: 500 }
    );
  }
}
