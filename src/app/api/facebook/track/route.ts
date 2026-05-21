import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { sendFacebookEvent, type FacebookEvent, getFacebookTestEventCode } from "@/lib/facebook";
import { prepareUserData, extractRequestContext } from "@/utils/tracking/facebook-helpers";

/**
 * Meta Conversions API mirror endpoint.
 *
 * Receives a thin event payload from the browser (event_name, event_id, custom_data)
 * and enriches it server-side with:
 *   - hashed user_data from the authenticated NextAuth session (when logged in)
 *   - client_ip_address + client_user_agent from request headers
 *   - fbc + fbp from request cookies + URL fbclid (via extractFBCFromRequest)
 *   - event_source_url from body or Referer header
 *
 * Always fires with `action_source: "website"` — browser-originated mirror.
 * For webhook-initiated server events (Purchase, Subscribe), use the dedicated
 * server-side helpers in `src/utils/tracking/pixel-purchase-tracking.ts` which
 * use `action_source: "system_generated"`.
 *
 * Dedup: client browser Pixel fires with the same event_id as 4th-arg eventID,
 * Meta merges them within ~48h. See:
 * https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
 */

// Custom data schema mirrors Meta's CAPI custom_data spec
const customDataSchema = z
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
  .passthrough(); // allow extra fields like brand, page_type, user_type, etc.

const trackEventSchema = z.object({
  event_name: z.enum([
    "ViewContent",
    "AddToCart",
    "InitiateCheckout",
    "AddPaymentInfo",
    "Lead",
    "Search",
    // PageView, Purchase, CompleteRegistration, Subscribe are handled by dedicated paths
    // and intentionally excluded here to keep this endpoint focused on funnel events.
  ]),
  event_id: z.string().min(1, "event_id is required for Pixel↔CAPI deduplication"),
  custom_data: customDataSchema.optional(),
  event_source_url: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = trackEventSchema.parse(body);

    // Build user_data from the authenticated session (when present).
    // Anonymous events still go through — they just rely on fbc/fbp/IP/UA for EMQ.
    let hashedUserData: Record<string, string> = {};
    try {
      const session = await getServerSession(authOptions);
      const userId = session?.user?.id;
      if (userId) {
        await connectDB();
        // Pull only the fields we need for hashing — keep the query lean.
        const user = await User.findById(userId)
          .select("email mobile firstName lastName state country _id")
          .lean<{
            _id: { toString(): string };
            email?: string;
            mobile?: string;
            firstName?: string;
            lastName?: string;
            state?: string;
            country?: string;
          }>();
        if (user) {
          hashedUserData = prepareUserData({
            email: user.email,
            phone: user.mobile,
            firstName: user.firstName,
            lastName: user.lastName,
            state: user.state,
            country: user.country || "AU",
            externalId: user._id.toString(),
          });
        }
      }
    } catch (sessionErr) {
      // Never block CAPI on session errors — anonymous tracking is still valuable.
      if (process.env.NODE_ENV === "development") {
        console.warn("[Meta CAPI] Session lookup failed, continuing as anonymous:", sessionErr);
      }
    }

    // Extract request context: IP, UA, fbc, fbp
    const ctx = extractRequestContext(request);

    const userData: FacebookEvent["user_data"] = {
      ...hashedUserData,
      ...(ctx.client_ip_address && { client_ip_address: ctx.client_ip_address }),
      ...(ctx.client_user_agent && { client_user_agent: ctx.client_user_agent }),
      ...(ctx.fbc && { fbc: ctx.fbc }),
      ...(ctx.fbp && { fbp: ctx.fbp }),
    };

    const facebookEvent: FacebookEvent = {
      event_name: validatedData.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: validatedData.event_id,
      action_source: "website",
      event_source_url:
        validatedData.event_source_url || request.headers.get("referer") || undefined,
      user_data: userData,
      custom_data: validatedData.custom_data,
    };

    const success = await sendFacebookEvent(facebookEvent, getFacebookTestEventCode());

    return NextResponse.json(
      {
        success,
        event_id: validatedData.event_id,
      },
      { status: success ? 200 : 502 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: "Invalid request data", errors: error.issues },
        { status: 400 }
      );
    }
    console.error("[Meta CAPI mirror] Unhandled error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
