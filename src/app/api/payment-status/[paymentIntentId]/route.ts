import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
// import User from "@/models/User"; // TODO: Implement user updates

/**
 * GET /api/payment-status/[paymentIntentId]
 * Check if payment benefits have been processed
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ paymentIntentId: string }> }) {
  try {
    await connectDB();

    const { paymentIntentId } = await params;

    if (!paymentIntentId) {
      return NextResponse.json({ error: "Payment Intent ID is required" }, { status: 400 });
    }

    // Check if payment has been processed
    const eventId = `BenefitsGranted-${paymentIntentId}`;
    console.log(`🔍 Payment Status API: Checking for PaymentEvent: ${eventId}`);

    const paymentEvent = await PaymentEvent.findById(eventId);
    console.log(`🔍 Payment Status API: PaymentEvent found: ${!!paymentEvent}`);

    if (paymentEvent) {
      console.log(`🔍 Payment Status API: PaymentEvent details:`, {
        _id: paymentEvent._id,
        paymentIntentId: paymentEvent.paymentIntentId,
        eventType: paymentEvent.eventType,
        packageType: paymentEvent.packageType,
        processedBy: paymentEvent.processedBy,
      });
    } else {
      console.log(`🔍 Payment Status API: No PaymentEvent found for ${eventId}`);
      // Let's also check if there are any PaymentEvents with this paymentIntentId
      const alternativeSearch = await PaymentEvent.findOne({ paymentIntentId });
      console.log(`🔍 Payment Status API: Alternative search by paymentIntentId: ${!!alternativeSearch}`);
      if (alternativeSearch) {
        console.log(`🔍 Payment Status API: Found PaymentEvent with different _id:`, alternativeSearch._id);
      }
    }

    if (paymentEvent) {
      // Payment has been processed
      console.log(`✅ Payment Status API: Payment processed, returning success`);
      return NextResponse.json({
        success: true,
        processed: true,
        status: "completed",
        data: {
          paymentIntentId,
          eventType: paymentEvent.eventType,
          packageType: paymentEvent.packageType,
          packageName: paymentEvent.packageName,
          entries: paymentEvent.data.entries,
          points: paymentEvent.data.points,
          processedBy: paymentEvent.processedBy,
          timestamp: paymentEvent.timestamp,
        },
      });
    } else {
      // Payment not yet processed
      console.log(`⏳ Payment Status API: Payment not yet processed, returning pending`);
      return NextResponse.json({
        success: true,
        processed: false,
        status: "pending",
        data: {
          paymentIntentId,
          message: "Payment is being processed...",
        },
      });
    }
  } catch (error) {
    console.error("Error checking payment status:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
