// src/app/api/facebook/track/route.ts
/**
 * @deprecated Use `POST /api/tracking/conversion` (provider-agnostic).
 * This handler remains as a forwarding shim so existing client calls (e.g. legacy
 * `useFacebookTracking` hooks or direct fetches to /api/facebook/track) keep working.
 * Translates the legacy FB-shaped body into a CanonicalEvent and delegates to sendConversion.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendConversion } from "@/lib/tracking/dispatch";
import type { CanonicalEvent } from "@/lib/tracking/types";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
import { generateEventID } from "@/utils/tracking/facebook-helpers";

const legacyBodySchema = z.object({
  event_name: z.enum([
    "PageView",
    "ViewContent",
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
    "Search",
    "CompleteRegistration",
    "Lead",
    "Subscribe",
  ]),
  event_id: z.string().optional(),
  user_data: z
    .object({
      em: z.string().optional(),
      ph: z.string().optional(),
      fn: z.string().optional(),
      ln: z.string().optional(),
      ct: z.string().optional(),
      st: z.string().optional(),
      zp: z.string().optional(),
      country: z.string().optional(),
      client_ip_address: z.string().optional(),
      client_user_agent: z.string().optional(),
      fbc: z.string().optional(),
      fbp: z.string().optional(),
    })
    .optional(),
  custom_data: z
    .object({
      currency: z.string().optional(),
      value: z.number().optional(),
      content_ids: z.array(z.string()).optional(),
      content_type: z.string().optional(),
      content_name: z.string().optional(),
      content_category: z.string().optional(),
      num_items: z.number().optional(),
      order_id: z.string().optional(),
      search_string: z.string().optional(),
    })
    .optional(),
  event_source_url: z.string().optional(),
  action_source: z
    .enum(["website", "app", "phone_call", "chat", "physical_store", "system_generated", "other"])
    .default("website"),
});

function ipFromHeaders(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof legacyBodySchema>;
  try {
    parsed = legacyBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: "Invalid request data", errors: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  // Note: legacy body contains pre-hashed user_data (em, ph, etc.). The new provider re-hashes from raw,
  // so we pass these as providerData.facebook to bypass re-hashing.
  const eventId =
    parsed.event_id ?? generateEventID(parsed.event_name.toLowerCase(), parsed.custom_data?.order_id ?? Date.now().toString());

  const event: CanonicalEvent = {
    eventName: parsed.event_name,
    eventId,
    eventTime: eventTimeNow(),
    value: parsed.custom_data?.value,
    currency: parsed.custom_data?.currency,
    eventSourceUrl: parsed.event_source_url ?? request.headers.get("referer") ?? undefined,
    customData: {
      orderId: parsed.custom_data?.order_id,
      contentIds: parsed.custom_data?.content_ids,
      contentType: parsed.custom_data?.content_type,
      contentName: parsed.custom_data?.content_name,
      contentCategory: parsed.custom_data?.content_category,
      numItems: parsed.custom_data?.num_items,
      searchString: parsed.custom_data?.search_string,
    },
    providerData: {
      facebook: {
        // Pre-hashed user_data passthrough — facebookProvider.capiSend recognises the
        // `_legacyUserData` reserved key and merges it into FacebookEvent.user_data
        // (not custom_data), so Event Match Quality and fbc/fbp dedup are preserved.
        // Callers using the canonical /api/tracking/conversion endpoint should send raw
        // PII via `userData` instead — the provider hashes it there.
        _legacyUserData: parsed.user_data ?? {},
      },
    },
  };

  const ctx = {
    clientIpAddress: parsed.user_data?.client_ip_address ?? ipFromHeaders(request),
    clientUserAgent: parsed.user_data?.client_user_agent ?? request.headers.get("user-agent") ?? undefined,
    eventSourceUrl: event.eventSourceUrl,
  };

  const results = await sendConversion(event, ctx);
  const success = results.facebook;
  return NextResponse.json(
    success
      ? { success: true, message: "Event tracked successfully", event_id: eventId }
      : { success: false, message: "Failed to track event" },
    { status: success ? 200 : 500 },
  );
}

export async function GET() {
  return NextResponse.json({
    message: "Facebook tracking endpoint (deprecated — use /api/tracking/conversion)",
    supported_events: [
      "PageView",
      "ViewContent",
      "AddToCart",
      "InitiateCheckout",
      "Purchase",
      "Search",
      "CompleteRegistration",
      "Lead",
      "Subscribe",
    ],
  });
}
