import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendConversion } from "@/lib/tracking/dispatch";
import type { CanonicalEvent, RequestContext } from "@/lib/tracking/types";
import { eventTimeNow } from "@/lib/tracking/canonical-event";

const userDataSchema = z
  .object({
    email: z.string().optional(),
    phone: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    externalId: z.string().optional(),
    birthdate: z.union([z.string(), z.date()]).optional(),
    clientIpAddress: z.string().optional(),
    clientUserAgent: z.string().optional(),
    fbc: z.string().optional(),
    fbp: z.string().optional(),
    ttclid: z.string().optional(),
    scid: z.string().optional(),
  })
  .optional();

const customDataSchema = z
  .object({
    contentIds: z.array(z.string()).optional(),
    contentType: z.string().optional(),
    contentName: z.string().optional(),
    contentCategory: z.string().optional(),
    numItems: z.number().optional(),
    orderId: z.string().optional(),
    packageType: z.string().optional(),
    searchString: z.string().optional(),
  })
  .optional();

const conversionBodySchema = z.object({
  eventName: z.string().min(1),
  eventId: z.string().min(1),
  eventTime: z.number().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  userData: userDataSchema,
  customData: customDataSchema,
  eventSourceUrl: z.string().optional(),
  providerData: z
    .object({
      facebook: z.record(z.string(), z.unknown()).optional(),
      tiktok: z.record(z.string(), z.unknown()).optional(),
      snapchat: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function ipFromHeaders(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof conversionBodySchema>;
  try {
    parsed = conversionBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid event body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const event: CanonicalEvent = {
    eventName: parsed.eventName,
    eventId: parsed.eventId,
    eventTime: parsed.eventTime ?? eventTimeNow(),
    value: parsed.value,
    currency: parsed.currency,
    userData: parsed.userData,
    customData: parsed.customData,
    eventSourceUrl: parsed.eventSourceUrl,
    providerData: parsed.providerData,
  };

  const ctx: RequestContext = {
    clientIpAddress: parsed.userData?.clientIpAddress ?? ipFromHeaders(request),
    clientUserAgent: parsed.userData?.clientUserAgent ?? request.headers.get("user-agent") ?? undefined,
    eventSourceUrl: parsed.eventSourceUrl ?? request.headers.get("referer") ?? undefined,
  };

  const results = await sendConversion(event, ctx);
  const ok = Object.values(results).some(Boolean);
  return NextResponse.json({ ok, results }, { status: 200 });
}
