import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import {
  applyScheduledPromoMonthCalendar,
  validateFullMonthDayGrid,
} from "@/services/admin/scheduled-promo-month-apply.service";
import { parseAestDateKey } from "@/utils/promo/scheduled-promo-calendar";
import { zPromoMultiplierOrNull } from "@/lib/zod/promo-multiplier-schema";

const calendarDaySchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  multiplier: zPromoMultiplierOrNull,
});

const bodySchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  days: z.array(calendarDaySchema).min(1),
  name: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

function daysBelongToMonth(year: number, month: number, days: z.infer<typeof bodySchema>["days"]): string | null {
  const parsed = validateFullMonthDayGrid(
    year,
    month,
    days.map((d) => ({ dateKey: d.dateKey, multiplier: d.multiplier }))
  );
  if (!parsed.ok) return parsed.error;
  for (const d of days) {
    const parts = parseAestDateKey(d.dateKey);
    if (!parts || parts.year !== year || parts.month !== month) {
      return `Date ${d.dateKey} is not in the selected month.`;
    }
  }
  return null;
}

/**
 * POST /api/admin/promo/scheduled/apply-month
 * Replace overlapping scheduled promos for a Sydney calendar month with painted per-day multipliers.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { default: User } = await import("@/models/User");
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const json = await request.json();
    const body = bodySchema.parse(json);

    const monthError = daysBelongToMonth(body.year, body.month, body.days);
    if (monthError) {
      return NextResponse.json({ success: false, error: monthError }, { status: 400 });
    }

    const result = await applyScheduledPromoMonthCalendar({
      type: body.type,
      year: body.year,
      month: body.month,
      days: body.days.map((d) => ({ dateKey: d.dateKey, multiplier: d.multiplier })),
      createdBy: new mongoose.Types.ObjectId(String(user._id)),
      name: body.name,
      description: body.description,
    });

    return NextResponse.json({
      success: true,
      createdPromoIds: result.createdPromoIds,
      softDeletedCount: result.softDeletedCount,
      adjustedCount: result.adjustedCount,
    });
  } catch (error) {
    console.error("❌ Error applying scheduled promo month:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("Expected") ? 400 : 500 }
    );
  }
}
