import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
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
    const guard = await requirePermission("users.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

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
            .select("paymentIntentId timestamp data")
            .lean()
        : [];

    const partialRows =
      benefitsPaymentIntentIds.length > 0
        ? await PaymentEvent.find({
            userId: userObjectId,
            eventType: "RefundPartial",
            paymentIntentId: { $in: benefitsPaymentIntentIds },
          })
            .select("paymentIntentId timestamp data")
            .lean()
        : [];

    const refundProcessedAtByPi = new Map<string, string>();
    const refundReversedByPi = new Map<string, unknown>();
    const refundReversalIssuesByPi = new Map<string, unknown>();
    for (const row of refundRows) {
      const pi = row.paymentIntentId;
      if (typeof pi !== "string" || !row.timestamp) continue;
      const iso =
        row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString();
      const prev = refundProcessedAtByPi.get(pi);
      if (!prev || new Date(iso) > new Date(prev)) {
        refundProcessedAtByPi.set(pi, iso);
      }
      const data = row.data as { reversed?: unknown; reversalIssues?: unknown } | undefined;
      if (data?.reversed !== undefined) {
        refundReversedByPi.set(pi, data.reversed);
      }
      if (data?.reversalIssues !== undefined) {
        refundReversalIssuesByPi.set(pi, data.reversalIssues);
      }
    }

    const partialRefundByPi = new Map<string, { refundAmount?: number; status?: string }>();
    for (const row of partialRows) {
      const pi = row.paymentIntentId;
      if (typeof pi !== "string") continue;
      const data = row.data as { status?: string; refundAmount?: number } | undefined;
      partialRefundByPi.set(pi, {
        refundAmount: typeof data?.refundAmount === "number" ? data.refundAmount : undefined,
        status: typeof data?.status === "string" ? data.status : undefined,
      });
    }

    const refundedSet = new Set(refundProcessedAtByPi.keys());

    const mapped = events.map((event) => {
      const pi = typeof event.paymentIntentId === "string" ? event.paymentIntentId : undefined;
      const isRefundedBenefits =
        event.eventType === "BenefitsGranted" && pi != null && refundedSet.has(pi);
      const partial = pi != null ? partialRefundByPi.get(pi) : undefined;
      return {
        _id: event._id,
        eventType: event.eventType,
        paymentIntentId: pi,
        hasRefundProcessed: isRefundedBenefits,
        refundProcessedAt: isRefundedBenefits ? refundProcessedAtByPi.get(pi) : undefined,
        hasPartialRefundSkipped:
          event.eventType === "BenefitsGranted" && pi != null && partial?.status === "partial-skipped",
        partialRefundAmountCents:
          event.eventType === "BenefitsGranted" && pi != null && partial?.status === "partial-skipped"
            ? partial.refundAmount
            : undefined,
        refundReversedSummary: isRefundedBenefits && pi ? refundReversedByPi.get(pi) : undefined,
        refundReversalIssues: isRefundedBenefits && pi ? refundReversalIssuesByPi.get(pi) : undefined,
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
