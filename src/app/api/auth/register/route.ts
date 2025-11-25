import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import { klaviyo } from "@/lib/klaviyo";
import { createUserRegisteredEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
// TikTok Pixel tracking disabled for now - client-side only
// import { trackTikTokEvent } from "@/components/TikTokPixel";
import { sendFacebookEvent, FacebookEvent } from "@/lib/facebook";
import {
  generateEventID,
  prepareUserData,
  extractFBCFromRequest,
  extractFBPFromRequest,
} from "@/utils/tracking/facebook-helpers";
import { trackAffiliateSignup } from "@/lib/affiliate";

// Registration validation schema
const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name cannot be more than 50 characters"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name cannot be more than 50 characters"),
  email: z.string().email("Please enter a valid email address"),
  mobile: z
    .string()
    .min(1, "Mobile number is required")
    .refine((mobile) => {
      // Remove spaces and validate Australian mobile format
      const cleaned = mobile.replace(/\s+/g, "");
      return /^(\+61|61|0)?[4-5]\d{8}$/.test(cleaned);
    }, "Please enter a valid Australian mobile number (e.g., 0412345678 or +61412345678)"),
  affiliateCode: z.string().optional(),
});

/**
 * POST /api/auth/register
 * Register a new user account
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    console.log(`🔄 Attempting to register user: ${validatedData.email}`);

    // Check if user already exists by email
    const existingUserByEmail = await User.findOne({ email: validatedData.email.toLowerCase() });
    if (existingUserByEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Email already taken",
          field: "email",
          message: "An account with this email address already exists. Please use a different email or try logging in.",
        },
        { status: 400 }
      );
    }

    // Check if user already exists by mobile number
    const cleanedMobile = validatedData.mobile.replace(/\s+/g, "");
    const existingUserByMobile = await User.findOne({ mobile: cleanedMobile });
    if (existingUserByMobile) {
      return NextResponse.json(
        {
          success: false,
          error: "Mobile number taken",
          field: "mobile",
          message:
            "An account with this mobile number already exists. Please use a different mobile number or try logging in.",
        },
        { status: 400 }
      );
    }

    // Create new user account (passwordless)
    const newUser = new User({
      firstName: validatedData.firstName.trim(),
      lastName: validatedData.lastName.trim(),
      email: validatedData.email.toLowerCase().trim(),
      mobile: cleanedMobile, // Store without spaces
      role: "user",
      // No password field - passwordless system
      profileSetupCompleted: false, // New users need to complete profile setup
      subscription: {
        packageId: "",
        startDate: new Date(),
        isActive: false,
        autoRenew: true,
        status: "incomplete",
        pendingChange: undefined, // Initialize pendingChange field for subscription management
        lastDowngradeDate: undefined, // Initialize lastDowngradeDate field for security
      }, // Initialize subscription structure (no active subscription initially)
      oneTimePackages: [], // No packages initially
      accumulatedEntries: 0,
      entryWallet: 0,
      rewardsPoints: 0,
      // ✅ Removed majorDrawEntries - using single source of truth in majordraws collection
      cart: [],
      isEmailVerified: false, // TODO: Implement email verification
      isMobileVerified: false, // TODO: Implement mobile verification
      isActive: true,
      savedPaymentMethods: [], // No payment methods initially
      upsellPurchases: [],
      upsellStats: {
        totalShown: 0,
        totalAccepted: 0,
        totalDeclined: 0,
        totalDismissed: 0,
        conversionRate: 0,
        lastInteraction: null,
      },
      upsellHistory: [],
      miniDrawPackages: [],
    });

    await newUser.save();
    console.log(`✅ User registered successfully: ${newUser._id}`, {
      profileSetupCompleted: newUser.profileSetupCompleted,
      needsSetup: !newUser.profileSetupCompleted,
    });

    // Track affiliate signup if affiliate code is provided (non-blocking)
    if (validatedData.affiliateCode) {
      try {
        await trackAffiliateSignup({
          affiliateCode: validatedData.affiliateCode,
          userId: newUser._id.toString(),
          userEmail: newUser.email,
        });
        console.log(`✅ Affiliate signup tracked: ${validatedData.affiliateCode}`);
      } catch (affiliateError) {
        // Non-blocking - log but don't fail registration
        console.error("Affiliate tracking error:", affiliateError);
      }
    }

    // Track registration in Klaviyo (non-blocking)
    klaviyo.trackEventBackground(createUserRegisteredEvent(newUser, "email"));

    // ✅ NEW: Ensure user profile is synced to Klaviyo (works for all users, paid or not)
    ensureUserProfileSynced(newUser);

    // ✅ NEW: Track pixel registration event (non-blocking)
    // Generate unique event ID for deduplication (needed for response)
    const eventID = generateEventID("registration", newUser._id.toString());

    try {
      const eventTime = Math.floor(Date.now() / 1000);

      // 1. Track Browser Pixel (if in browser context - this is server-side, so skip)
      // Browser pixel will be tracked client-side if needed

      // 2. Track Conversions API (server-side)
      try {
        const userData = prepareUserData({
          email: newUser.email,
          phone: newUser.mobile,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        });

        // Extract fbc and fbp from request for better match quality
        const fbc = extractFBCFromRequest(request);
        const fbp = extractFBPFromRequest(request);

        if (fbc) userData.fbc = fbc;
        if (fbp) userData.fbp = fbp;

        const facebookEvent: FacebookEvent = {
          event_name: "CompleteRegistration",
          event_time: eventTime,
          event_id: eventID,
          action_source: "website",
          user_data: Object.keys(userData).length > 0 ? (userData as FacebookEvent["user_data"]) : {},
          event_source_url: request.headers.get("referer") || undefined,
        };

        // Get test event code if in development
        const testEventCode = process.env.NODE_ENV === "development" ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;

        const apiSuccess = await sendFacebookEvent(facebookEvent, testEventCode);
        if (apiSuccess) {
          console.log(`📘 Facebook Conversions API: Registration tracked for ${newUser.email} (EventID: ${eventID})`);
        } else {
          console.warn(`⚠️ Facebook Conversions API: Failed to send CompleteRegistration event (EventID: ${eventID})`);
        }
      } catch (apiError) {
        console.error("❌ Error sending CompleteRegistration to Facebook Conversions API:", apiError);
      }

      // 3. Track TikTok Pixel (disabled for now - client-side only)
      // TikTok pixel tracking is client-side only and will be handled in the client component
      // trackTikTokEvent("CompleteRegistration", registrationParams);
      // console.log(`📱 TikTok Pixel: Registration tracked for ${newUser.email}`);
    } catch (pixelError) {
      console.error("❌ Pixel registration tracking failed (non-blocking):", pixelError);
    }

    return NextResponse.json({
      success: true,
      message: "Account created successfully",
      data: {
        userId: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        mobile: newUser.mobile,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
        // Include EventID for client-side pixel tracking (deduplication)
        pixelEventId: eventID,
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: firstError.message,
          field: firstError.path[0],
          message: firstError.message,
        },
        { status: 400 }
      );
    }

    // Handle MongoDB duplicate key errors
    if (error instanceof Error && error.message.includes("duplicate key")) {
      if (error.message.includes("email")) {
        return NextResponse.json(
          {
            success: false,
            error: "Email already taken",
            field: "email",
            message:
              "An account with this email address already exists. Please use a different email or try logging in.",
          },
          { status: 400 }
        );
      }
      if (error.message.includes("mobile")) {
        return NextResponse.json(
          {
            success: false,
            error: "Mobile number taken",
            field: "mobile",
            message:
              "An account with this mobile number already exists. Please use a different mobile number or try logging in.",
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Registration failed",
        message: "Failed to create account. Please try again.",
      },
      { status: 500 }
    );
  }
}
