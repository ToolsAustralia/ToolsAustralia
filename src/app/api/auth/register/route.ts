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
import { sendFacebookEvent, FacebookEvent, getFacebookTestEventCode } from "@/lib/facebook";
import { tiktokProvider } from "@/lib/tracking/providers/tiktok";
import type { CanonicalEvent } from "@/lib/tracking/types";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
import {
  generateEventID,
  prepareUserData,
  extractRequestContext,
} from "@/utils/tracking/facebook-helpers";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import { extractClickIdsFromRequest } from "@/utils/tracking/click-capture";
import { parseReferrer } from "@/utils/tracking/referrer-helpers";
import { userDataForRegistration } from "@/utils/tracking/registration-user-data";
import { trackAffiliateSignup } from "@/lib/affiliate";
import { extractBrandFromSlug } from "@/utils/integrations/klaviyo/brand-extraction";
import {
  buildSignupAttribution,
  mergeSignupAttribution,
  plainSignupAttribution,
} from "@/services/attribution/signup-attribution";
import { IUser } from "@/models/User";
import { isPrivilegedAccount } from "@/utils/auth/privileged-account";
import type { AttributionParams } from "@/types/tracking";
import { stripe } from "@/lib/stripe";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

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
  builtPrizeSlug: z.string().optional(), // Prize assembled in "Build your prize" at signup
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
  // Staff/admin accounts are NEVER "plain" — they carry 0 entries by nature but
  // must not be overwritten by a public registration. Guard here too so no future
  // update path can reach a privileged account even if a caller forgets the check.
  if (isPrivilegedAccount(user)) return false;
  return !user.accumulatedEntries || user.accumulatedEntries === 0;
}

/**
 * Fire the canonical Klaviyo `Started Checkout` event for the GUEST registration
 * funnel — both the new-user path AND the three existing-user re-registration
 * paths. Called everywhere `User Registered` fires, so the funnel events stay
 * 1:1 (no orphaned `User Registered` without a matching `Started Checkout`).
 *
 * Skips gracefully when:
 *  - `packageId` is missing (affiliate / Google-OAuth / non-modal paths)
 *  - the packageId doesn't resolve to a known package
 *
 * Always sets `isAuthenticated: false` because this path runs at registration
 * submit and the user is, by definition, a guest at this moment (MembershipModal
 * step-1 success does NOT auto-login — see docs/auth/gotchas.md).
 *
 * Not gated on consent — this is a committed action (registration submitted),
 * not browsing behaviour. Klaviyo's marketing-list subscription gates email
 * sends separately.
 */
function fireKlaviyoStartedCheckoutForGuestRegistration(
  user: IUser,
  validatedData: { packageId?: string; promotionSlug?: string }
): void {
  if (!validatedData.packageId) return;
  try {
    const pkg = getPackageById(validatedData.packageId);
    if (!pkg) return;
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
      createStartedCheckoutEvent(user, {
        packageId: pkg._id,
        packageName: pkg.name,
        packageType,
        tier: pkg.name.toLowerCase(),
        price: pkg.price,
        numEntries: pkg.entriesPerMonth ?? pkg.totalEntries,
        checkoutUrl,
        promoSlug: validatedData.promotionSlug,
        step: "registered",
        isAuthenticated: false,
      })
    );
  } catch (err) {
    // Non-blocking: never fail registration on a tracking error.
    console.error(`Failed to fire Klaviyo Started Checkout for ${user.email}:`, err);
  }
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
 * Resolve the paid platform from the request's click-id cookies, if any.
 *
 * Reuses `extractClickIdsFromRequest` — the SAME extractor the payment-attribution path
 * uses — so a signup and the purchase that follows it agree on the platform. When more
 * than one click id is present (rare: a visitor clicked ads on two platforms), the most
 * recently captured wins, matching the recency rule in `platformPriority.ts`; signals
 * with no capture timestamp lose to any dated one and otherwise fall back to declaration
 * order. Returns undefined for organic traffic.
 */
function resolveSignupClickPlatform(
  request: NextRequest
): "meta" | "tiktok" | "snapchat" | "google" | undefined {
  try {
    const signals = extractClickIdsFromRequest(request);
    if (signals.length === 0) return undefined;
    // capturedAt is epoch ms (or null when undatable) — a null loses to any dated signal.
    const best = [...signals].sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0))[0];
    const p = best.platform;
    return p === "meta" || p === "tiktok" || p === "snapchat" || p === "google" ? p : undefined;
  } catch {
    // Attribution is never allowed to break registration.
    return undefined;
  }
}

// Abuse guard: each registration triggers a Stripe customer create + a Facebook
// CAPI call + multiple Mongo writes, all awaited on the request path — so an
// unthrottled scripted loop can burn the small per-instance pool and spawn junk
// accounts + Stripe customers. This per-instance limiter cuts off a naive
// single-IP flood. The limit is intentionally more lenient than login's 5/min:
// registration is funnel-rate, and ad spikes can route many legitimate signups
// through one carrier-NAT / shared egress IP, so we avoid false-positives while
// still stopping obvious abuse. (Shared Mongo-backed store, so the limit holds
// across serverless instances; tune `maxRequests` if real traffic approaches it.)
const registerRateLimiter = createDistributedRateLimiter("auth-register", {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 20, // 20 registrations per minute per IP
});

/**
 * POST /api/auth/register
 * Register a new user account or update existing plain account
 */
/**
 * Fire CompleteRegistration to the TikTok Events API (server-side) — parity with the Meta
 * CAPI CompleteRegistration this route already sends. The legacy browser TikTok helper never
 * ran here (window is undefined server-side), so TikTok received ZERO registration signal.
 * This sends the real Events API event with the SAME event_id as the Meta event (dedup-safe),
 * plus ttclid/_ttp for match quality. Never throws (tracking must not break registration).
 */
async function sendTikTokCompleteRegistration(
  request: NextRequest,
  user: { email?: string | null; mobile?: string | null; _id: { toString(): string } },
  eventId: string,
): Promise<void> {
  try {
    const ctx = extractRequestContext(request);
    const tt = extractTikTokContext(request);
    const referer = request.headers.get("referer") || undefined;
    const canonical: CanonicalEvent = {
      eventName: "CompleteRegistration",
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      userData: {
        ...(user.email && { email: user.email }),
        ...(user.mobile && { phone: user.mobile }),
        externalId: user._id.toString(),
        ...(tt.ttclid && { ttclid: tt.ttclid }),
        ...(tt.ttp && { ttp: tt.ttp }),
        ...(ctx.client_ip_address && { clientIpAddress: ctx.client_ip_address }),
        ...(ctx.client_user_agent && { clientUserAgent: ctx.client_user_agent }),
      },
      ...(referer && { eventSourceUrl: referer }),
      actionSource: "website",
    };
    await tiktokProvider.capiSend(canonical, {
      clientIpAddress: ctx.client_ip_address,
      clientUserAgent: ctx.client_user_agent,
      ...(referer && { eventSourceUrl: referer }),
    });
  } catch (e) {
    console.error("❌ TikTok CompleteRegistration (non-blocking):", e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await registerRateLimiter.check(identifier);
    if (!rateCheck.success) {
      // `message` is the field MembershipModal renders (result.message || generic
      // fallback) — without it a rate-limited user sees "Registration failed.
      // Please try again." and retries immediately instead of waiting.
      return NextResponse.json(
        {
          success: false,
          error: "Too many registration attempts. Please wait a moment before trying again.",
          message: "Too many registration attempts. Please wait a moment before trying again.",
        },
        { status: 429, headers: { "Retry-After": rateCheck.retryAfterSeconds.toString() } }
      );
    }

    await connectDB();

    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Attribution for signup (client-sent or fallback to Referer)
    const attribution = getAttributionFromRequest(validatedData, request.headers.get("referer"));
    // Resolved once here and threaded into every buildSignupAttribution call below —
    // ALL FOUR registration branches (existing-plain-account, existing-by-email,
    // existing-by-mobile, brand-new) must stamp it, or signup-source analytics would
    // silently under-count paid signups for returning users.
    const signupClickPlatform = resolveSignupClickPlatform(request);

    // console.log(`🔄 Attempting to register user: ${validatedData.email}`);

    // Clean and normalize mobile number to +61 format for consistency
    const cleanedMobile = normalizeMobileNumber(validatedData.mobile);

    // Check for existing users by email and mobile separately
    const existingUserByEmail = await User.findOne({ email: validatedData.email.toLowerCase() });
    const existingUserByMobile = await User.findOne({ mobile: cleanedMobile });

    // ✅ SECURITY (privileged-account guard): a STAFF/ADMIN account must never be
    // mutated by the public registration path. Staff accounts have 0 entries and no
    // saved payment methods, so the "plain account" update paths below would treat
    // them as safe to overwrite — letting an unauthenticated request rebind a
    // privileged account's name/mobile, and (on a mobile match) move its login email
    // onto an attacker-controlled address, keeping the admin role. Reject up front.
    // The staff marker is roleId/userType, NOT the legacy `role` string.
    if (existingUserByEmail && isPrivilegedAccount(existingUserByEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "Email already taken",
          field: "email",
          message: "This email address is already associated with an existing account. Please log in instead.",
          isExistingAccount: true,
          existingAccountEmail: existingUserByEmail.email,
        },
        { status: 400 }
      );
    }
    if (existingUserByMobile && isPrivilegedAccount(existingUserByMobile)) {
      // Do NOT echo `existingAccountEmail` here: unlike the email-match branch (where the
      // caller already supplied the email), on a MOBILE match that value is the matched
      // account's login email — returning it would disclose a staff/admin email to an
      // anonymous caller who only supplied the mobile (enumeration → feeds email-code login).
      return NextResponse.json(
        {
          success: false,
          error: "Mobile number taken",
          field: "mobile",
          message: "This mobile number is already associated with an existing account. Please log in instead.",
          isExistingAccount: true,
        },
        { status: 400 }
      );
    }

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
          // No `existingAccountEmail` on a MOBILE match: it would disclose the matched
          // account's email to a caller who only supplied the mobile. The client falls
          // back to the email the user typed (MembershipModal `formData.email`), so a
          // legit returning customer still gets a correct login prefill. Mirrors the
          // privileged-account fix — see docs/auth/gotchas.md.
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
          // No `existingAccountEmail` on a MOBILE match — see the converted-account
          // branch above; the client falls back to the typed email.
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

          const signupAttr = buildSignupAttribution(
            validatedData.promotionSlug,
            attribution,
            validatedData.builtPrizeSlug,
            signupClickPlatform
          );
          if (signupAttr)
            existingUser.signupAttribution = mergeSignupAttribution(
              plainSignupAttribution(existingUser.signupAttribution),
              signupAttr
            );

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

          // Started Checkout — fires whenever User Registered fires, so the
          // funnel events stay 1:1. Covers the "guest re-registers with a
          // different package after closing the modal" case.
          fireKlaviyoStartedCheckoutForGuestRegistration(existingUser, validatedData);

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

          // TikTok Events API — parity with the Meta CAPI CompleteRegistration above.
          await sendTikTokCompleteRegistration(request, existingUser, eventID);

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

      const signupAttrEmail = buildSignupAttribution(
        validatedData.promotionSlug,
        attribution,
        validatedData.builtPrizeSlug,
        signupClickPlatform
      );
      if (signupAttrEmail)
        existingUser.signupAttribution = mergeSignupAttribution(
          plainSignupAttribution(existingUser.signupAttribution),
          signupAttrEmail
        );

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
      // Started Checkout — keep 1:1 with User Registered (see helper JSDoc).
      fireKlaviyoStartedCheckoutForGuestRegistration(existingUser, validatedData);
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

      // TikTok Events API — parity with the Meta CAPI CompleteRegistration above.
      await sendTikTokCompleteRegistration(request, existingUser, eventID);

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

      const signupAttrMobile = buildSignupAttribution(
        validatedData.promotionSlug,
        attribution,
        validatedData.builtPrizeSlug,
        signupClickPlatform
      );
      if (signupAttrMobile)
        existingUser.signupAttribution = mergeSignupAttribution(
          plainSignupAttribution(existingUser.signupAttribution),
          signupAttrMobile
        );

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
      // Started Checkout — keep 1:1 with User Registered (see helper JSDoc).
      fireKlaviyoStartedCheckoutForGuestRegistration(existingUser, validatedData);
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

      // TikTok Events API — parity with the Meta CAPI CompleteRegistration above.
      await sendTikTokCompleteRegistration(request, existingUser, eventID);

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
    const signupAttr = buildSignupAttribution(
      validatedData.promotionSlug,
      attribution,
      validatedData.builtPrizeSlug,
      signupClickPlatform
    );
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

    // ✅ Canonical "Started Checkout" event (step="registered") — guest funnel.
    // See `fireKlaviyoStartedCheckoutForGuestRegistration` JSDoc above for why
    // this is server-side, what gates it, and the three OTHER register paths
    // that also call it (existing-plain-account re-registration).
    fireKlaviyoStartedCheckoutForGuestRegistration(newUser, validatedData);

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

      // 3. TikTok Events API — parity with the Meta CAPI CompleteRegistration above.
      await sendTikTokCompleteRegistration(request, newUser, eventID);
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
