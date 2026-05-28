import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import { klaviyo } from "@/lib/klaviyo";
import { createUserRegisteredEvent, createStartedCheckoutEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import {
  ensureUserProfileSynced,
  createKlaviyoProfileAndSubscribe,
} from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { buildCheckoutResumeUrl } from "@/utils/integrations/klaviyo/checkout-resume-url";
import { getPackageById } from "@/data/membershipPackages";
// TikTok Pixel tracking disabled for now - client-side only
// import { trackTikTokEvent } from "@/components/TikTokPixel";
import { sendFacebookEvent, FacebookEvent, getFacebookTestEventCode } from "@/lib/facebook";
import {
  generateEventID,
  prepareUserData,
  extractRequestContext,
} from "@/utils/tracking/facebook-helpers";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import { parseReferrer } from "@/utils/tracking/referrer-helpers";
import { userDataForRegistration } from "@/utils/tracking/registration-user-data";
import { trackAffiliateSignup } from "@/lib/affiliate";
import { extractBrandFromSlug } from "@/utils/integrations/klaviyo/brand-extraction";
import { isValidPromoSlug, getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import { IUser } from "@/models/User";
import type { AttributionParams } from "@/types/tracking";
import { stripe } from "@/lib/stripe";

/**
 * Normalize Australian mobile number to +61 format
 * Converts various formats to consistent +61412345678 format
 */
function normalizeMobileNumber(mobile: string): string {
  // Remove all spaces first
  const cleaned = mobile.replace(/\s+/g, "");
  
  // Normalize to +61 format
  if (cleaned.startsWith("+61")) {
    return cleaned; // Already in +61 format
  } else if (cleaned.startsWith("61") && cleaned.length > 2) {
    return `+${cleaned}`; // 61412345678 -> +61412345678
  } else if (cleaned.startsWith("0")) {
    return `+61${cleaned.substring(1)}`; // 0412345678 -> +61412345678
  } else if (cleaned.startsWith("4") || cleaned.startsWith("5")) {
    return `+61${cleaned}`; // 412345678 -> +61412345678
  }
  
  // Return as-is if format is unrecognized (validation will catch it)
  return cleaned;
}

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
  promotionSlug: z.string().optional(), // Optional promotion slug for brand interest tracking
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  campaign_id: z.string().optional(),
  adset_id: z.string().optional(),
  ad_id: z.string().optional(),
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  // Optional package context — when present, the server fires a canonical
  // Klaviyo `Started Checkout` event (step="registered") after profile sync
  // so the ads team's abandoned-checkout flow can target this user reliably.
  // Affiliate / Google-OAuth / other non-modal registration paths omit this
  // and the Started Checkout fire is gracefully skipped.
  packageId: z.string().optional(),
});

/**
 * Determines if a user account is "plain" (never made purchases/participated)
 * A plain account has accumulatedEntries === 0, meaning no successful conversions
 * @param user - User document to check
 * @returns true if account is plain and safe to update
 */
function isPlainAccount(user: IUser | null): boolean {
  if (!user) return false;
  return !user.accumulatedEntries || user.accumulatedEntries === 0;
}

/**
 * Get attribution from client body or fallback to Referer header.
 */
function getAttributionFromRequest(
  validatedData: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    campaign_id?: string;
    adset_id?: string;
    ad_id?: string;
  },
  referer: string | null
): AttributionParams {
  const fromClient =
    validatedData.utm_source ||
    validatedData.utm_medium ||
    validatedData.utm_campaign ||
    validatedData.utm_content ||
    validatedData.utm_term ||
    validatedData.campaign_id ||
    validatedData.adset_id ||
    validatedData.ad_id;
  if (fromClient) {
    return {
      ...(validatedData.utm_source && { utm_source: validatedData.utm_source }),
      ...(validatedData.utm_medium && { utm_medium: validatedData.utm_medium }),
      ...(validatedData.utm_campaign && { utm_campaign: validatedData.utm_campaign }),
      ...(validatedData.utm_content && { utm_content: validatedData.utm_content }),
      ...(validatedData.utm_term && { utm_term: validatedData.utm_term }),
      ...(validatedData.campaign_id && { campaign_id: validatedData.campaign_id }),
      ...(validatedData.adset_id && { adset_id: validatedData.adset_id }),
      ...(validatedData.ad_id && { ad_id: validatedData.ad_id }),
    };
  }
  if (referer) {
    return extractAttributionParams(referer);
  }
  return {};
}

/**
 * Build signup attribution from promotion slug and optional attribution for analytics.
 */
function buildSignupAttribution(
  promotionSlug?: string,
  attribution?: AttributionParams
): {
  promotionPageType: "evergreen" | "toolset";
  promotionSlug: string;
  visitedAt: Date;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
} | undefined {
  if (!promotionSlug || !isValidPromoSlug(promotionSlug)) return undefined;
  return {
    promotionPageType: getPageTypeFromSlug(promotionSlug),
    promotionSlug: promotionSlug.toLowerCase().trim(),
    visitedAt: new Date(),
    ...(attribution?.utm_source && { utmSource: attribution.utm_source }),
    ...(attribution?.utm_medium && { utmMedium: attribution.utm_medium }),
    ...(attribution?.utm_campaign && { utmCampaign: attribution.utm_campaign }),
    ...(attribution?.utm_content && { utmContent: attribution.utm_content }),
    ...(attribution?.utm_term && { utmTerm: attribution.utm_term }),
    ...(attribution?.campaign_id && { campaignId: attribution.campaign_id }),
    ...(attribution?.adset_id && { adsetId: attribution.adset_id }),
    ...(attribution?.ad_id && { adId: attribution.ad_id }),
  };
}

/**
 * POST /api/auth/register
 * Register a new user account or update existing plain account
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Attribution for signup (client-sent or fallback to Referer)
    const attribution = getAttributionFromRequest(validatedData, request.headers.get("referer"));

    // console.log(`🔄 Attempting to register user: ${validatedData.email}`);

    // Clean and normalize mobile number to +61 format for consistency
    const cleanedMobile = normalizeMobileNumber(validatedData.mobile);

    // Check for existing users by email and mobile separately
    const existingUserByEmail = await User.findOne({ email: validatedData.email.toLowerCase() });
    const existingUserByMobile = await User.findOne({ mobile: cleanedMobile });

    // ✅ CRITICAL: Check for converted accounts first (security priority)
    // If email belongs to a converted account, reject immediately
    if (existingUserByEmail && !isPlainAccount(existingUserByEmail)) {
      // console.log(
      //   `🚫 Email belongs to converted account (${existingUserByEmail.accumulatedEntries} entries) - cannot register: ${existingUserByEmail._id}`
      // );
      return NextResponse.json(
        {
          success: false,
          error: "Email already taken",
          field: "email",
          message:
            "This email address is already associated with an account that has made purchases. Please log in or use a different email address.",
          isExistingAccount: true,
          existingAccountEmail: existingUserByEmail.email, // Return the actual email (same as provided)
        },
        { status: 400 }
      );
    }

    // If mobile belongs to a converted account, reject immediately
    if (existingUserByMobile && !isPlainAccount(existingUserByMobile)) {
      // console.log(
      //   `🚫 Mobile belongs to converted account (${existingUserByMobile.accumulatedEntries} entries) - cannot register: ${existingUserByMobile._id}`
      // );
      return NextResponse.json(
        {
          success: false,
          error: "Mobile number taken",
          field: "mobile",
          message:
            "This mobile number is already associated with an account that has made purchases. Please log in or use a different mobile number.",
          isExistingAccount: true,
          existingAccountEmail: existingUserByMobile.email, // Return the actual email associated with this mobile number
        },
        { status: 400 }
      );
    }

    // ✅ NEW: Check for users with savedPaymentMethods (indicates account activity)
    // If email belongs to a user with saved payment methods, reject registration
    if (
      existingUserByEmail &&
      existingUserByEmail.savedPaymentMethods &&
      existingUserByEmail.savedPaymentMethods.length > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Email already taken",
          field: "email",
          message:
            "This email address is already associated with an account that has saved payment methods. Please log in or use a different email address.",
          isExistingAccount: true,
          existingAccountEmail: existingUserByEmail.email,
        },
        { status: 400 }
      );
    }

    // If mobile belongs to a user with saved payment methods, reject registration
    if (
      existingUserByMobile &&
      existingUserByMobile.savedPaymentMethods &&
      existingUserByMobile.savedPaymentMethods.length > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Mobile number taken",
          field: "mobile",
          message:
            "This mobile number is already associated with an account that has saved payment methods. Please log in or use a different mobile number.",
          isExistingAccount: true,
          existingAccountEmail: existingUserByMobile.email,
        },
        { status: 400 }
      );
    }

    // ✅ Handle plain account scenarios
    // If both email and mobile match the same plain account, update it
    if (existingUserByEmail && existingUserByMobile) {
      if (existingUserByEmail._id.toString() === existingUserByMobile._id.toString()) {
        // Same user - both email and mobile match, update the account
        const existingUser = existingUserByEmail;
        if (isPlainAccount(existingUser)) {
          // Plain account (no entries = no purchases/participation) - safe to update
          // console.log(`🔄 Updating plain account: ${existingUser._id} (no accumulated entries)`);

          // Update account details with new registration data
          existingUser.firstName = validatedData.firstName.trim();
          existingUser.lastName = validatedData.lastName.trim();
          existingUser.email = validatedData.email.toLowerCase().trim();
          existingUser.mobile = cleanedMobile;

          const signupAttr = buildSignupAttribution(validatedData.promotionSlug, attribution);
          if (signupAttr) existingUser.signupAttribution = signupAttr;

          // Handle affiliate code update (only if provided and not already set)
          if (
            validatedData.affiliateCode &&
            (!existingUser.affiliateReferral || !existingUser.affiliateReferral.affiliateId)
          ) {
            try {
              await trackAffiliateSignup({
                affiliateCode: validatedData.affiliateCode,
                userId: existingUser._id.toString(),
                userEmail: existingUser.email,
              });
              // console.log(`✅ Affiliate signup tracked for updated account: ${validatedData.affiliateCode}`);
              // Refresh user to get updated affiliate data
              await existingUser.save();
              const refreshedUser = await User.findById(existingUser._id);
              if (refreshedUser) {
                Object.assign(existingUser, refreshedUser);
              }
            } catch (affiliateError) {
              // Non-blocking - log but don't fail registration
              console.error("Affiliate tracking error for updated account:", affiliateError);
            }
          }

          await existingUser.save();

          // console.log(`✅ Plain account updated successfully: ${existingUser._id}`);

          // Track registration update in Klaviyo (non-blocking)
          klaviyo.trackEventBackground(createUserRegisteredEvent(existingUser, "email"));

          // Extract brand interest from promotion slug (if provided)
          const brandInterest = validatedData.promotionSlug
            ? extractBrandFromSlug(validatedData.promotionSlug)
            : extractBrandFromSlug(null);

          // Update Klaviyo profile with brand interest
          ensureUserProfileSynced(existingUser, brandInterest);

          // Generate event ID for tracking (use existing user ID)
          const eventID = generateEventID("registration", existingUser._id.toString());

          // Track Facebook Pixel event for account update
          try {
            const eventTime = Math.floor(Date.now() / 1000);

            const userData = prepareUserData(userDataForRegistration(existingUser));

            const ctx = extractRequestContext(request);
            if (ctx.client_ip_address) userData.client_ip_address = ctx.client_ip_address;
            if (ctx.client_user_agent) userData.client_user_agent = ctx.client_user_agent;
            // Body wins, cookie is the fallback (opposite of the purchase path): the
            // register POST can fire before the Meta pixel writes _fbc, and the API URL
            // has no fbclid to reconstruct from — so the client-sent value is more reliable.
            const fbc = validatedData.fbc ?? ctx.fbc;
            const fbp = validatedData.fbp ?? ctx.fbp;
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

            const apiSuccess = await sendFacebookEvent(facebookEvent, getFacebookTestEventCode());
            if (apiSuccess) {
              // console.log(
              //   `📘 Facebook Conversions API: Registration update tracked for ${existingUser.email} (EventID: ${eventID})`
              // );
            } else {
              // console.warn(
              //   `⚠️ Facebook Conversions API: Failed to send CompleteRegistration event for update (EventID: ${eventID})`
              // );
            }
          } catch (pixelError) {
            console.error("❌ Pixel registration update tracking failed (non-blocking):", pixelError);
          }

          // Return updated user data (same format as new registration)
          return NextResponse.json({
            success: true,
            message: "Step 1 completed",
            data: {
              userId: existingUser._id,
              email: existingUser.email,
              firstName: existingUser.firstName,
              lastName: existingUser.lastName,
              mobile: existingUser.mobile,
              role: existingUser.role,
              isActive: existingUser.isActive,
              createdAt: existingUser.createdAt,
              pixelEventId: eventID,
            },
          });
        }
      } else {
        // ✅ CRITICAL: Different users - email matches one account, mobile matches another
        // This is a conflict - we cannot allow this as it would create duplicate data
        // console.log(
        //   `🚫 Conflict detected: Email matches user ${existingUserByEmail._id}, Mobile matches different user ${existingUserByMobile._id}`
        // );
        return NextResponse.json(
          {
            success: false,
            error: "Registration conflict",
            field: "general",
            message:
              "The email and mobile number belong to different accounts. Please use matching credentials or contact support.",
          },
          { status: 400 }
        );
      }
    }

    // If only email matches a plain account, update it
    if (existingUserByEmail && isPlainAccount(existingUserByEmail)) {
      const existingUser = existingUserByEmail;
      // console.log(`🔄 Updating plain account (email match): ${existingUser._id} (no accumulated entries)`);

      // Update account details
      existingUser.firstName = validatedData.firstName.trim();
      existingUser.lastName = validatedData.lastName.trim();
      existingUser.email = validatedData.email.toLowerCase().trim();
      existingUser.mobile = cleanedMobile;

      const signupAttrEmail = buildSignupAttribution(validatedData.promotionSlug, attribution);
      if (signupAttrEmail) existingUser.signupAttribution = signupAttrEmail;

      // Handle affiliate code update (only if provided and not already set)
      if (
        validatedData.affiliateCode &&
        (!existingUser.affiliateReferral || !existingUser.affiliateReferral.affiliateId)
      ) {
        try {
          await trackAffiliateSignup({
            affiliateCode: validatedData.affiliateCode,
            userId: existingUser._id.toString(),
            userEmail: existingUser.email,
          });
          // console.log(`✅ Affiliate signup tracked for updated account: ${validatedData.affiliateCode}`);
          await existingUser.save();
          const refreshedUser = await User.findById(existingUser._id);
          if (refreshedUser) {
            Object.assign(existingUser, refreshedUser);
          }
        } catch (affiliateError) {
          console.error("Affiliate tracking error for updated account:", affiliateError);
        }
      }

      await existingUser.save();
      // console.log(`✅ Plain account updated successfully (email match): ${existingUser._id}`);

      // Track events
      klaviyo.trackEventBackground(createUserRegisteredEvent(existingUser, "email"));
      const brandInterest = validatedData.promotionSlug
        ? extractBrandFromSlug(validatedData.promotionSlug)
        : extractBrandFromSlug(null);
      ensureUserProfileSynced(existingUser, brandInterest);
      const eventID = generateEventID("registration", existingUser._id.toString());

      try {
        const eventTime = Math.floor(Date.now() / 1000);
        const userData = prepareUserData(userDataForRegistration(existingUser));
        const ctx = extractRequestContext(request);
        if (ctx.client_ip_address) userData.client_ip_address = ctx.client_ip_address;
        if (ctx.client_user_agent) userData.client_user_agent = ctx.client_user_agent;
        const fbc = validatedData.fbc ?? ctx.fbc;
        const fbp = validatedData.fbp ?? ctx.fbp;
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
        await sendFacebookEvent(facebookEvent, getFacebookTestEventCode());
      } catch (pixelError) {
        console.error("❌ Pixel registration update tracking failed (non-blocking):", pixelError);
      }

      return NextResponse.json({
        success: true,
        message: "Step 1 completed",
        data: {
          userId: existingUser._id,
          email: existingUser.email,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          mobile: existingUser.mobile,
          role: existingUser.role,
          isActive: existingUser.isActive,
          createdAt: existingUser.createdAt,
          pixelEventId: eventID,
        },
      });
    }

    // If only mobile matches a plain account, update it
    if (existingUserByMobile && isPlainAccount(existingUserByMobile)) {
      const existingUser = existingUserByMobile;
      // console.log(`🔄 Updating plain account (mobile match): ${existingUser._id} (no accumulated entries)`);

      // Update account details
      existingUser.firstName = validatedData.firstName.trim();
      existingUser.lastName = validatedData.lastName.trim();
      existingUser.email = validatedData.email.toLowerCase().trim();
      existingUser.mobile = cleanedMobile;

      const signupAttrMobile = buildSignupAttribution(validatedData.promotionSlug, attribution);
      if (signupAttrMobile) existingUser.signupAttribution = signupAttrMobile;

      // Handle affiliate code update (only if provided and not already set)
      if (
        validatedData.affiliateCode &&
        (!existingUser.affiliateReferral || !existingUser.affiliateReferral.affiliateId)
      ) {
        try {
          await trackAffiliateSignup({
            affiliateCode: validatedData.affiliateCode,
            userId: existingUser._id.toString(),
            userEmail: existingUser.email,
          });
          // console.log(`✅ Affiliate signup tracked for updated account: ${validatedData.affiliateCode}`);
          await existingUser.save();
          const refreshedUser = await User.findById(existingUser._id);
          if (refreshedUser) {
            Object.assign(existingUser, refreshedUser);
          }
        } catch (affiliateError) {
          console.error("Affiliate tracking error for updated account:", affiliateError);
        }
      }

      await existingUser.save();
      // console.log(`✅ Plain account updated successfully (mobile match): ${existingUser._id}`);

      // Track events
      klaviyo.trackEventBackground(createUserRegisteredEvent(existingUser, "email"));
      const brandInterest = validatedData.promotionSlug
        ? extractBrandFromSlug(validatedData.promotionSlug)
        : extractBrandFromSlug(null);
      ensureUserProfileSynced(existingUser, brandInterest);
      const eventID = generateEventID("registration", existingUser._id.toString());

      try {
        const eventTime = Math.floor(Date.now() / 1000);
        const userData = prepareUserData(userDataForRegistration(existingUser));
        const ctx = extractRequestContext(request);
        if (ctx.client_ip_address) userData.client_ip_address = ctx.client_ip_address;
        if (ctx.client_user_agent) userData.client_user_agent = ctx.client_user_agent;
        const fbc = validatedData.fbc ?? ctx.fbc;
        const fbp = validatedData.fbp ?? ctx.fbp;
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
        await sendFacebookEvent(facebookEvent, getFacebookTestEventCode());
      } catch (pixelError) {
        console.error("❌ Pixel registration update tracking failed (non-blocking):", pixelError);
      }

      return NextResponse.json({
        success: true,
        message: "Step 1 completed",
        data: {
          userId: existingUser._id,
          email: existingUser.email,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          mobile: existingUser.mobile,
          role: existingUser.role,
          isActive: existingUser.isActive,
          createdAt: existingUser.createdAt,
          pixelEventId: eventID,
        },
      });
    }

    // No existing accounts found - create new user account (passwordless)
    const signupAttr = buildSignupAttribution(validatedData.promotionSlug, attribution);
    const newUser = new User({
      firstName: validatedData.firstName.trim(),
      lastName: validatedData.lastName.trim(),
      email: validatedData.email.toLowerCase().trim(),
      mobile: cleanedMobile, // Store without spaces
      role: "user",
      // No password field - passwordless system
      profileSetupCompleted: false, // New users need to complete profile setup
      ...(signupAttr && { signupAttribution: signupAttr }),
      subscription: {
        packageId: "",
        startDate: new Date(),
        isActive: false,
        autoRenew: true,
        status: "incomplete",
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
    // console.log(`✅ User registered successfully: ${newUser._id}`, {
    //   profileSetupCompleted: newUser.profileSetupCompleted,
    //   needsSetup: !newUser.profileSetupCompleted,
    // });

    // ✅ STRIPE BEST PRACTICE: Create Stripe customer upfront during registration
    // This ensures PaymentIntent can have customer set BEFORE confirmation, enabling proper webhook processing
    try {
      const stripeCustomer = await stripe.customers.create({
        email: newUser.email,
        name: `${newUser.firstName} ${newUser.lastName}`,
        phone: newUser.mobile || undefined,
        metadata: {
          userId: newUser._id.toString(),
        },
      });

      // Link Stripe customer to user account
      newUser.stripeCustomerId = stripeCustomer.id;
      await newUser.save();
      console.log(`✅ Created Stripe customer ${stripeCustomer.id} for user ${newUser._id}`);
    } catch (stripeError) {
      // Non-blocking - log but don't fail registration
      // Customer can be created later during purchase if needed
      console.error("Failed to create Stripe customer during registration:", stripeError);
    }

    // Track affiliate signup if affiliate code is provided (non-blocking)
    if (validatedData.affiliateCode) {
      try {
        await trackAffiliateSignup({
          affiliateCode: validatedData.affiliateCode,
          userId: newUser._id.toString(),
          userEmail: newUser.email,
        });
        // console.log(`✅ Affiliate signup tracked: ${validatedData.affiliateCode}`);
      } catch (affiliateError) {
        // Non-blocking - log but don't fail registration
        console.error("Affiliate tracking error:", affiliateError);
      }
    }

    // Track registration in Klaviyo (non-blocking)
    klaviyo.trackEventBackground(createUserRegisteredEvent(newUser, "email"));

    // Extract brand interest from promotion slug (if provided)
    // This will be used to set brand_interest in Klaviyo profile for users who haven't purchased yet
    const brandInterest = validatedData.promotionSlug
      ? extractBrandFromSlug(validatedData.promotionSlug)
      : extractBrandFromSlug(null); // Default to "milwaukee" if no slug provided

    // ✅ Step 1: Sync profile data to Klaviyo (non-blocking)
    // Pass brand interest so it can be set in Klaviyo profile (will be removed when user makes any purchase)
    // This ensures profile data is synced immediately for other operations
    ensureUserProfileSynced(newUser, brandInterest);

    // ✅ FIX: Step 2: Create profile and subscribe user ONCE during registration
    // This replaces the setTimeout pattern which had race conditions
    // The function properly handles profile creation before subscription with retry logic
    // This ensures users who manually unsubscribe won't be resubscribed on future syncs
    createKlaviyoProfileAndSubscribe(newUser, brandInterest).catch((error) => {
      // Log error but don't block registration - Klaviyo failures shouldn't prevent user registration
      console.error(`❌ Background Klaviyo profile creation/subscription failed for ${newUser.email}:`, error);
    });

    // ✅ Canonical "Started Checkout" event (step="registered") — fires for the
    // guest registration path only when the client passes packageId. The authed
    // path fires client-side from MembershipModal:2658. The two paths are
    // mutually exclusive so no dedupe is needed. See spec §5 and
    // docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names".
    //
    // Server-side over client-side here because Klaviyo's onsite cookie is not
    // yet set for a never-cookied guest at the moment they complete step-1 —
    // pushing via Events API with explicit customer_properties.email attaches
    // reliably to the just-created Klaviyo profile.
    //
    // Note: this fire is NOT gated on hasPixelConsent() — it represents a
    // committed action (registration submitted), not browsing behaviour. See
    // docs/auth/gotchas.md.
    if (validatedData.packageId) {
      try {
        const pkg = getPackageById(validatedData.packageId);
        if (pkg) {
          const baseUrl =
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            "https://toolsaustralia.com.au";
          const checkoutUrl = buildCheckoutResumeUrl({
            baseUrl,
            packageId: pkg._id,
            promoSlug: validatedData.promotionSlug,
          });
          const packageType: "membership" | "one-time" =
            pkg.type === "subscription" ? "membership" : "one-time";
          klaviyo.trackEventBackground(
            createStartedCheckoutEvent(newUser, {
              packageId: pkg._id,
              packageName: pkg.name,
              packageType,
              tier: pkg.name.toLowerCase(),
              price: pkg.price,
              numEntries: pkg.entriesPerMonth ?? pkg.totalEntries,
              checkoutUrl,
              promoSlug: validatedData.promotionSlug,
              step: "registered",
            })
          );
        }
      } catch (err) {
        // Non-blocking: never fail registration on a tracking error.
        console.error(`Failed to fire Klaviyo Started Checkout for ${newUser.email}:`, err);
      }
    }

    // ✅ NEW: Track pixel registration event (non-blocking)
    // Generate unique event ID for deduplication (needed for response)
    const eventID = generateEventID("registration", newUser._id.toString());

    try {
      const eventTime = Math.floor(Date.now() / 1000);

      // 1. Track Browser Pixel (if in browser context - this is server-side, so skip)
      // Browser pixel will be tracked client-side if needed

      // 2. Track Conversions API (server-side)
      try {
        const userData = prepareUserData(userDataForRegistration(newUser));

        // Extract IP, user agent, click ID (fbc), and fbp from request for better match quality
        const ctx = extractRequestContext(request);
        if (ctx.client_ip_address) userData.client_ip_address = ctx.client_ip_address;
        if (ctx.client_user_agent) userData.client_user_agent = ctx.client_user_agent;
        const fbc = validatedData.fbc ?? ctx.fbc;
        const fbp = validatedData.fbp ?? ctx.fbp;
        if (fbc) userData.fbc = fbc;
        if (fbp) userData.fbp = fbp;

        // UTM and referrer for Facebook CAPI (utm from client/referer, not request.url)
        const referrerHeader = request.headers.get("referer") || "";
        const referrerInfo = parseReferrer(referrerHeader);

        // Determine source based on UTM and referrer
        let source = "direct";
        if (attribution.utm_source) {
          source = attribution.utm_source;
        } else if (referrerInfo.referrer_domain) {
          // Determine source from referrer domain
          const domain = referrerInfo.referrer_domain.toLowerCase();
          if (domain.includes("google")) {
            source = "organic";
          } else if (domain.includes("facebook") || domain.includes("instagram")) {
            source = "social";
          } else if (domain.includes("bing") || domain.includes("yahoo")) {
            source = "organic";
          } else {
            source = "referral";
          }
        }

        // Build custom data with enhanced parameters (removed registration_method and content_type)
        const customData: Record<string, unknown> = {
          platform: "tools-australia-website",
          source,
          ...(referrerInfo.referrer && { referrer: referrerInfo.referrer }),
          ...(referrerInfo.referrer_domain && { referrer_domain: referrerInfo.referrer_domain }),
          ...(attribution.utm_source && { utm_source: attribution.utm_source }),
          ...(attribution.utm_medium && { utm_medium: attribution.utm_medium }),
          ...(attribution.utm_campaign && { utm_campaign: attribution.utm_campaign }),
          // Add brand interest if available from promotion slug
          ...(validatedData.promotionSlug && {
            initial_interest: extractBrandFromSlug(validatedData.promotionSlug) || validatedData.promotionSlug,
          }),
        };

        const facebookEvent: FacebookEvent = {
          event_name: "CompleteRegistration",
          event_time: eventTime,
          event_id: eventID,
          action_source: "website",
          user_data: Object.keys(userData).length > 0 ? (userData as FacebookEvent["user_data"]) : {},
          event_source_url: referrerInfo.referrer || request.headers.get("referer") || undefined,
          custom_data: customData,
        };

        const apiSuccess = await sendFacebookEvent(facebookEvent, getFacebookTestEventCode());
        if (apiSuccess) {
          // console.log(`📘 Facebook Conversions API: Registration tracked for ${newUser.email} (EventID: ${eventID})`);
        } else {
          // console.warn(`⚠️ Facebook Conversions API: Failed to send CompleteRegistration event (EventID: ${eventID})`);
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
      message: "Step 1 completed",
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
