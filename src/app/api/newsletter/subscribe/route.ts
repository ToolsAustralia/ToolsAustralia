import { NextRequest, NextResponse } from "next/server";
import { klaviyo } from "@/lib/klaviyo";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Valid email address is required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    const profileResult = await klaviyo.upsertProfile({
      email: trimmedEmail,
      properties: {
        newsletter_subscriber: true,
        newsletter_subscribed_at: new Date().toISOString(),
        source: "website_newsletter_form",
      },
    });

    if (!profileResult.success || !profileResult.profile_id) {
      console.error("Failed to create Klaviyo profile for newsletter:", profileResult.error);
      return NextResponse.json(
        { success: false, error: "Failed to subscribe. Please try again." },
        { status: 500 }
      );
    }

    const subscribeResult = await klaviyo.subscribeToEmailList(
      profileResult.profile_id,
      trimmedEmail
    );

    if (!subscribeResult.success) {
      console.error("Failed to subscribe to Klaviyo email list:", subscribeResult.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Newsletter subscription error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
