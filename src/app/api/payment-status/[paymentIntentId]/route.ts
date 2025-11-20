import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PaymentEvent, { type IPaymentEvent } from "@/models/PaymentEvent";

type PaymentStatusPayload =
  | {
      success: true;
      processed: true;
      status: "completed";
      data: {
        paymentIntentId: string;
        eventType: string;
        packageType: string;
        packageName?: string;
        entries?: number;
        points?: number;
        processedBy: string;
        timestamp: string;
      };
    }
  | {
      success: true;
      processed: false;
      status: "pending";
      data: {
        paymentIntentId: string;
        message: string;
      };
    };

type PaymentEventLean = Pick<
  IPaymentEvent,
  "paymentIntentId" | "eventType" | "packageType" | "packageName" | "data" | "processedBy" | "timestamp"
>;

const PAYMENT_STATUS_CACHE_TTL_MS = 4000;
const paymentStatusCache = new Map<string, { expiresAt: number; payload: PaymentStatusPayload }>();

/**
 * GET /api/payment-status/[paymentIntentId]
 * Check if payment benefits have been processed
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ paymentIntentId: string }> }) {
  try {
    const { paymentIntentId } = await params;

    if (!paymentIntentId) {
      return NextResponse.json({ error: "Payment Intent ID is required" }, { status: 400 });
    }

    const cachedPayload = getCachedPaymentStatus(paymentIntentId);
    if (cachedPayload) {
      return buildResponse(cachedPayload);
    }

    await connectDB();

    const eventId = `BenefitsGranted-${paymentIntentId}`;
    const paymentEvent = await PaymentEvent.findById(eventId)
      .select("_id paymentIntentId eventType packageType packageName data processedBy timestamp")
      .lean<PaymentEventLean | null>();

    let payload: PaymentStatusPayload;

    if (paymentEvent) {
      payload = {
        success: true,
        processed: true,
        status: "completed",
        data: {
          paymentIntentId,
          eventType: paymentEvent.eventType,
          packageType: paymentEvent.packageType,
          packageName: paymentEvent.packageName,
          entries: paymentEvent.data?.entries,
          points: paymentEvent.data?.points,
          processedBy: paymentEvent.processedBy,
          timestamp:
            paymentEvent.timestamp instanceof Date ? paymentEvent.timestamp.toISOString() : new Date().toISOString(),
        },
      };
    } else {
      payload = {
        success: true,
        processed: false,
        status: "pending",
        data: {
          paymentIntentId,
          message: "Payment is being processed...",
        },
      };
    }

    cachePaymentStatus(paymentIntentId, payload);
    return buildResponse(payload);
  } catch (error) {
    console.error("Error checking payment status:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}

function getCachedPaymentStatus(paymentIntentId: string): PaymentStatusPayload | null {
  const cached = paymentStatusCache.get(paymentIntentId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    paymentStatusCache.delete(paymentIntentId);
    return null;
  }

  return cached.payload;
}

function cachePaymentStatus(paymentIntentId: string, payload: PaymentStatusPayload): void {
  paymentStatusCache.set(paymentIntentId, {
    payload,
    expiresAt: Date.now() + PAYMENT_STATUS_CACHE_TTL_MS,
  });
}

function buildResponse(payload: PaymentStatusPayload): NextResponse<PaymentStatusPayload> {
  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "private, max-age=0, s-maxage=0");
  return response;
}
