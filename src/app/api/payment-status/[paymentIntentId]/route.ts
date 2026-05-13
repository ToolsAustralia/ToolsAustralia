import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PaymentEvent, { type IPaymentEvent } from "@/models/PaymentEvent";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

type PaymentStatusPayload =
  | {
      success: true;
      processed: true;
      status: "completed";
      data: {
        paymentIntentId: string;
        eventType: string;
        packageType: string;
        packageId?: string;
        packageName?: string;
        entries?: number;
        points?: number;
        price?: number;
        currency?: string;
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
        latestEventType?: string;
        latestEventAt?: string;
      };
    };

type PaymentEventLean = Pick<
  IPaymentEvent,
  "paymentIntentId" | "eventType" | "packageType" | "packageId" | "packageName" | "data" | "processedBy" | "timestamp"
>;

// Lowered from 4000ms to 1000ms after the async webhook cutover: BenefitsGranted
// PaymentEvents are now written ~5–15s after the Stripe webhook arrives (worker
// route latency), so a 4s `processed: false` cache compounds with worker delay
// and makes the PaymentProcessingScreen feel sluggish. 1s still de-duplicates
// the burst of polls usePaymentStatus fires while keeping freshness usable.
const PAYMENT_STATUS_CACHE_TTL_MS = 1000;
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

    const paymentEvent = await findBenefitsGrantedEvent(paymentIntentId);

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
          packageId: paymentEvent.packageId,
          packageName: paymentEvent.packageName,
          entries: paymentEvent.data?.entries,
          points: paymentEvent.data?.points,
          price: paymentEvent.data?.price,
          currency: "AUD",
          processedBy: paymentEvent.processedBy,
          timestamp:
            paymentEvent.timestamp instanceof Date ? paymentEvent.timestamp.toISOString() : new Date().toISOString(),
        },
      };
    } else {
      const hint = await getStripeProcessingHint(paymentIntentId);
      payload = {
        success: true,
        processed: false,
        status: "pending",
        data: {
          paymentIntentId,
          message: "Payment is being processed...",
          ...hint,
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

/**
 * Subscription benefits are recorded as BenefitsGranted-invoice_{invoiceId} with paymentIntentId invoice_{invoiceId}.
 * The client polls with the Stripe PaymentIntent id (pi_…); resolve the invoice-linked event when the direct id misses.
 */
/**
 * Map live PaymentIntent status to pseudo–webhook labels for deterministic client step UI.
 */
async function getStripeProcessingHint(
  paymentIntentId: string
): Promise<{ latestEventType?: string; latestEventAt?: string }> {
  if (!paymentIntentId.startsWith("pi_")) {
    return {};
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const statusMap: Record<string, string> = {
      requires_payment_method: "payment_intent.created",
      requires_confirmation: "payment_intent.processing",
      requires_action: "payment_intent.processing",
      processing: "payment_intent.processing",
      succeeded: "payment_intent.succeeded",
      canceled: "payment_intent.canceled",
    };
    return {
      latestEventType: statusMap[pi.status] ?? "payment_intent.processing",
      latestEventAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[payment-status] Could not retrieve PaymentIntent for hint:", paymentIntentId, err);
    return {};
  }
}

async function findBenefitsGrantedEvent(paymentIntentId: string): Promise<PaymentEventLean | null> {
  const directId = `BenefitsGranted-${paymentIntentId}`;
  const direct = await PaymentEvent.findById(directId)
    .select("_id paymentIntentId eventType packageType packageId packageName data processedBy timestamp")
    .lean<PaymentEventLean | null>();
  if (direct) {
    return direct;
  }

  if (!paymentIntentId.startsWith("pi_")) {
    return null;
  }

  try {
    const pi = (await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["invoice"],
    })) as Stripe.PaymentIntent & { invoice?: string | Stripe.Invoice | null };
    const inv = pi.invoice;
    const invoiceId = typeof inv === "string" ? inv : inv?.id;
    if (!invoiceId) {
      return null;
    }
    const invoiceEventId = `BenefitsGranted-invoice_${invoiceId}`;
    return PaymentEvent.findById(invoiceEventId)
      .select("_id paymentIntentId eventType packageType packageId packageName data processedBy timestamp")
      .lean<PaymentEventLean | null>();
  } catch (err) {
    console.warn("[payment-status] Could not map PaymentIntent to invoice BenefitsGranted event:", paymentIntentId, err);
    return null;
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
