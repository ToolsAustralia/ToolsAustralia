import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { klaviyo } from "@/lib/klaviyo";
import { createInvoiceGeneratedEvent } from "@/utils/integrations/klaviyo/klaviyo-events";

/**
 * Validation schema for invoice finalization request
 */
const invoiceFinalizeSchema = z.object({
  userId: z.string(),
  originalPurchase: z.object({
    paymentIntentId: z.string(),
    packageId: z.string(),
    packageName: z.string(),
    packageType: z.enum(["subscription", "one-time", "mini-draw"]),
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

    console.log(`📧 Finalizing invoice for user: ${validatedData.userId}`);
    console.log(`📧 Original purchase: ${validatedData.originalPurchase.packageName}`);
    console.log(`📧 Upsell included: ${!!validatedData.upsellPurchase}`);

    // Fetch user from database
    const user = await User.findById(validatedData.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build items array
    const items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }> = [
      {
        description: validatedData.originalPurchase.packageName,
        quantity: 1,
        unit_price: validatedData.originalPurchase.price,
        total_price: validatedData.originalPurchase.price,
      },
    ];

    // Add upsell if present
    if (validatedData.upsellPurchase) {
      items.push({
        description: validatedData.upsellPurchase.offerName,
        quantity: 1,
        unit_price: validatedData.upsellPurchase.price,
        total_price: validatedData.upsellPurchase.price,
      });
    }

    // Calculate totals
    const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0);
    const totalEntries = validatedData.originalPurchase.entries + (validatedData.upsellPurchase?.entries || 0);

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Determine package tier for subscriptions
    let packageTier: string | undefined;
    if (validatedData.originalPurchase.packageType === "subscription") {
      const packageId = validatedData.originalPurchase.packageId.toLowerCase();
      if (packageId.includes("boss")) packageTier = "Boss";
      else if (packageId.includes("foreman")) packageTier = "Foreman";
      else if (packageId.includes("tradie")) packageTier = "Tradie";
    }

    // Send combined invoice to Klaviyo
    const invoiceEvent = createInvoiceGeneratedEvent(user as never, {
      invoiceId: `inv_${validatedData.originalPurchase.paymentIntentId}`,
      invoiceNumber,
      packageType: validatedData.originalPurchase.packageType,
      packageId: validatedData.originalPurchase.packageId,
      packageName: validatedData.originalPurchase.packageName,
      packageTier,
      totalAmount,
      paymentIntentId: validatedData.originalPurchase.paymentIntentId,
      billingReason: validatedData.originalPurchase.packageType === "subscription" ? "subscription_create" : undefined,
      entries_gained: totalEntries,
      items,
    });

    await klaviyo.trackEventBackground(invoiceEvent);

    console.log(`✅ Combined invoice sent to Klaviyo`);
    console.log(
      `📊 Invoice #${invoiceNumber}: ${items.length} items, $${totalAmount.toFixed(2)}, ${totalEntries} entries`
    );

    return NextResponse.json({
      success: true,
      invoiceNumber,
      totalAmount,
      totalEntries,
      itemCount: items.length,
    });
  } catch (error) {
    console.error("Invoice finalization error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to finalize invoice" }, { status: 500 });
  }
}
