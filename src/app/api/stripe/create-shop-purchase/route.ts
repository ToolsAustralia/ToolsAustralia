// src/app/api/stripe/create-shop-purchase/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import User from "@/models/User";
import { createShopPurchase } from "@/services/shop/createShopPurchase.service";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

const Schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1) }))
    .min(1),
  shippingAddress: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    state: z.enum(AU_STATES),
    postalCode: z.string().regex(/^[0-9]{4}$/),
    country: z.string().optional(),
    deliveryInstructions: z.string().max(500).optional(),
  }),
  paymentMethodId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const data = Schema.parse(body);

    const session = await getServerSession(authOptions);
    let user: { _id: string; email: string; firstName?: string; lastName?: string } | null = null;
    if (session?.user?.id) {
      const u = await User.findById(session.user.id).lean<{
        _id: { toString: () => string };
        email: string;
        firstName?: string;
        lastName?: string;
      }>();
      if (u) {
        user = {
          _id: u._id.toString(),
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
        };
      }
    }

    const ctx = extractRequestContext(request);
    const eventSourceUrl =
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/checkout` : undefined);

    const result = await createShopPurchase({
      items: data.items,
      shippingAddress: data.shippingAddress,
      paymentMethodId: data.paymentMethodId,
      idempotencyKey: data.idempotencyKey,
      user,
      capiContext: {
        ip: ctx.client_ip_address,
        userAgent: ctx.client_user_agent,
        fbc: ctx.fbc,
        fbp: ctx.fbp,
        eventSourceUrl,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Cart validation failed", errors: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 });
    }
    console.error("[shop] create-shop-purchase failed", err);
    return NextResponse.json({ error: "Failed to create shop purchase" }, { status: 500 });
  }
}
