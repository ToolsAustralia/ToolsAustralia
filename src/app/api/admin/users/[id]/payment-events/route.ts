import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import mongoose from "mongoose";

type RouteParams = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

/**
 * GET /api/admin/users/[id]/payment-events
 * Paginated payment events for admin user detail (activity log).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );
    const skip = (page - 1) * limit;

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [events, total] = await Promise.all([
      PaymentEvent.find({ userId: userObjectId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentEvent.countDocuments({ userId: userObjectId }),
    ]);

    const benefitsPaymentIntentIds = events
      .filter((e) => e.eventType === "BenefitsGranted" && typeof e.paymentIntentId === "string")
      .map((e) => e.paymentIntentId as string);

    const refundRows =
      benefitsPaymentIntentIds.length > 0
        ? await PaymentEvent.find({
            userId: userObjectId,
            eventType: "RefundProcessed",
            paymentIntentId: { $in: benefitsPaymentIntentIds },
          })
            .select("paymentIntentId timestamp")
            .lean()
        : [];

    const refundProcessedAtByPi = new Map<string, string>();
    for (const row of refundRows) {
      const pi = row.paymentIntentId;
      if (typeof pi !== "string" || !row.timestamp) continue;
      const iso =
        row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString();
      const prev = refundProcessedAtByPi.get(pi);
      if (!prev || new Date(iso) > new Date(prev)) {
        refundProcessedAtByPi.set(pi, iso);
      }
    }

    const refundedSet = new Set(refundProcessedAtByPi.keys());

    const mapped = events.map((event) => {
      const pi = typeof event.paymentIntentId === "string" ? event.paymentIntentId : undefined;
      const isRefundedBenefits =
        event.eventType === "BenefitsGranted" && pi != null && refundedSet.has(pi);
      return {
        _id: event._id,
        eventType: event.eventType,
        paymentIntentId: pi,
        hasRefundProcessed: isRefundedBenefits,
        refundProcessedAt: isRefundedBenefits ? refundProcessedAtByPi.get(pi) : undefined,
        timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp),
        packageType: event.packageType,
        packageId: event.packageId != null ? String(event.packageId) : undefined,
        packageName: typeof event.packageName === "string" ? event.packageName : undefined,
        data: event.data,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        events: mapped,
        page,
        limit,
        total,
        hasMore: skip + mapped.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching user payment events:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch payment events",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
