import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { trackCombinedInvoice } from "@/utils/integrations/klaviyo/klaviyo-invoice-service";

/**
 * Validation schema for invoice finalization request
 */
const invoiceFinalizeSchema = z.object({
  userId: z.string(),
  originalPurchase: z.object({
    paymentIntentId: z.string(),
    packageId: z.string(),
    packageName: z.string(),
    packageType: z.enum(["membership", "one-time", "mini-draw"]),
    price: z.number(),
    entries: z.number(),
  }),
  upsellPurchase: z
    .object({
      paymentIntentId: z.string(),
      offerId: z.string(),
      offerName: z.string(),
      price: z.number(),
      entries: z.number(),
    })
    .optional(),
});

/**
 * POST /api/invoice/finalize
 * Finalize and send invoice to Klaviyo after upsell decision
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = invoiceFinalizeSchema.parse(body);

    // console.log(`📧 Finalizing invoice for user: ${validatedData.userId}`);
    // console.log(`📧 Original purchase: ${validatedData.originalPurchase.packageName}`);
    // console.log(`📧 Upsell included: ${!!validatedData.upsellPurchase}`);

    // Fetch user from database
    const user = await User.findById(validatedData.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Track combined invoice using invoice service
    await trackCombinedInvoice(user, {
      originalPurchase: {
        paymentIntentId: validatedData.originalPurchase.paymentIntentId,
        packageId: validatedData.originalPurchase.packageId,
        packageName: validatedData.originalPurchase.packageName,
        packageType: validatedData.originalPurchase.packageType,
        price: validatedData.originalPurchase.price,
        entries: validatedData.originalPurchase.entries,
      },
      upsellPurchase: validatedData.upsellPurchase
        ? {
            paymentIntentId: validatedData.upsellPurchase.paymentIntentId,
            offerId: validatedData.upsellPurchase.offerId,
            offerName: validatedData.upsellPurchase.offerName,
            price: validatedData.upsellPurchase.price,
            entries: validatedData.upsellPurchase.entries,
          }
        : undefined,
    });

    // Calculate totals for response
    const totalAmount = validatedData.originalPurchase.price + (validatedData.upsellPurchase?.price || 0);
    const totalEntries = validatedData.originalPurchase.entries + (validatedData.upsellPurchase?.entries || 0);
    const itemCount = validatedData.upsellPurchase ? 2 : 1;

    return NextResponse.json({
      success: true,
      invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      totalAmount,
      totalEntries,
      itemCount,
    });
  } catch (error) {
    console.error("Invoice finalization error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to finalize invoice" }, { status: 500 });
  }
}
