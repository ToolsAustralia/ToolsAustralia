import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendFacebookEvent, FacebookEvent } from "@/lib/facebook";

// Validation schema for Facebook tracking events
const trackEventSchema = z.object({
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
  user_data: z
    .object({
      em: z.string().optional(), // email hash
      ph: z.string().optional(), // phone hash
      fn: z.string().optional(), // first name hash
      ln: z.string().optional(), // last name hash
      ct: z.string().optional(), // city hash
      st: z.string().optional(), // state hash
      zp: z.string().optional(), // zip code hash
      country: z.string().optional(),
      client_ip_address: z.string().optional(),
      client_user_agent: z.string().optional(),
      fbc: z.string().optional(), // Facebook click ID
      fbp: z.string().optional(), // Facebook browser ID
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate the request body
    const validatedData = trackEventSchema.parse(body);

    // Create Facebook event object
    const facebookEvent: FacebookEvent = {
      event_name: validatedData.event_name,
      event_time: Math.floor(Date.now() / 1000),
      user_data: validatedData.user_data || {},
      custom_data: validatedData.custom_data,
      event_source_url: validatedData.event_source_url || request.headers.get("referer") || undefined,
      action_source: validatedData.action_source,
    };

    // Add client IP and user agent if not provided
    if (!facebookEvent.user_data.client_ip_address) {
      facebookEvent.user_data.client_ip_address =
        request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    }

    if (!facebookEvent.user_data.client_user_agent) {
      facebookEvent.user_data.client_user_agent = request.headers.get("user-agent") || undefined;
    }

    // Send event to Facebook
    const success = await sendFacebookEvent(facebookEvent);

    if (success) {
      return NextResponse.json({ success: true, message: "Event tracked successfully" }, { status: 200 });
    } else {
      return NextResponse.json({ success: false, message: "Failed to track event" }, { status: 500 });
    }
  } catch (error) {
    console.error("Facebook tracking error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request data",
          errors: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// Handle GET requests for testing
export async function GET() {
  return NextResponse.json({
    message: "Facebook tracking endpoint is active",
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
    usage: "Send POST request with event data to track Facebook events",
  });
}
