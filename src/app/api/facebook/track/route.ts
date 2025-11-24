import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendFacebookEvent, FacebookEvent } from "@/lib/facebook";
import { generateEventID } from "@/utils/tracking/facebook-helpers";

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
  event_id: z.string().optional(), // Event ID for deduplication
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

    // Generate EventID if not provided (critical for deduplication)
    let eventId = validatedData.event_id;
    if (!eventId) {
      // Generate EventID using order_id, or fallback to timestamp
      const identifier =
        validatedData.custom_data?.order_id ||
        validatedData.user_data?.em?.substring(0, 8) || // Use first 8 chars of email hash as identifier
        Date.now().toString();
      eventId = generateEventID(validatedData.event_name.toLowerCase(), identifier);
    }

    // Handle IP address (take first IP if comma-separated)
    let clientIp = validatedData.user_data?.client_ip_address;
    if (!clientIp) {
      const forwardedFor = request.headers.get("x-forwarded-for");
      if (forwardedFor) {
        clientIp = forwardedFor.split(",")[0].trim();
      } else {
        clientIp = request.headers.get("x-real-ip") || "127.0.0.1";
      }
    }

    // Create Facebook event object
    const facebookEvent: FacebookEvent = {
      event_name: validatedData.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId, // Include EventID for deduplication
      user_data: {
        ...validatedData.user_data,
        client_ip_address: clientIp,
        client_user_agent:
          validatedData.user_data?.client_user_agent || request.headers.get("user-agent") || undefined,
      },
      custom_data: validatedData.custom_data,
      event_source_url: validatedData.event_source_url || request.headers.get("referer") || undefined,
      action_source: validatedData.action_source,
    };

    // Get test event code from environment if in development
    const testEventCode =
      process.env.NODE_ENV === "development" ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;

    // Send event to Facebook
    const success = await sendFacebookEvent(facebookEvent, testEventCode);

    if (success) {
      return NextResponse.json(
        {
          success: true,
          message: "Event tracked successfully",
          event_id: eventId,
        },
        { status: 200 }
      );
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
