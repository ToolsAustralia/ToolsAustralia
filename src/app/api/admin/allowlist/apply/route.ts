import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";

const Body = z.object({
  rows: z
    .array(
      z.object({
        cardFingerprint: z.string().min(1),
        cardLast4: z.string().default(""),
        cardBrand: z.string().default("unknown"),
        stripeCustomerId: z.string().nullable().default(null),
        customerEmail: z.string().nullable().default(null),
        declineCode: z.string().nullable().default(null),
        failureCode: z.string().nullable().default(null),
        triggeringPaymentIntentId: z.string().nullable().default(null),
        triggeringChargeId: z.string().nullable().default(null),
      })
    )
    .min(1)
    .max(500),
  allowOverride: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth || !("adminUser" in auth)) {
    return auth.errorResponse;
  }

  await connectDB();

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid request body", detail: String(err) },
      { status: 400 }
    );
  }

  const svc = getAllowlistService();
  const performedBy = new Types.ObjectId(String(auth.adminUser._id));

  let added = 0;
  let skipped = 0;
  const errors: Array<{ cardFingerprint: string; message: string }> = [];

  for (const row of body.rows) {
    try {
      const result = await svc.apply(row, "admin_bulk", performedBy, body.allowOverride);
      if (result.action === "added") added += 1;
      else if (result.action === "skipped") skipped += 1;
    } catch (err) {
      errors.push({
        cardFingerprint: row.cardFingerprint,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    // Polite throttle — Stripe rate-limit headroom for ≤500-row bulks.
    await new Promise((r) => setTimeout(r, 50));
  }

  return NextResponse.json({ success: true, added, skipped, errors });
}
