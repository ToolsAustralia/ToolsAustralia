import { NextRequest, NextResponse } from "next/server";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { reconcilePartnerDiscountAccess } from "@/utils/partner-discounts/sso-access";
import { generatePortalSso, logSsoIssuance } from "@/utils/partner-discounts/sso-flow";

/**
 * POST /api/partner-discount/sso
 *
 * SSO hand-off into the MyRewards portal. Identity comes from the NextAuth session
 * (no body). Reconcile-then-read gates on LIVE access before minting, so a cancelled
 * or expired member is refused (403). Thin handler — all logic lives in
 * `utils/partner-discounts/{sso-access,sso-flow}`. NOT an admin route, so Norm lockstep
 * (CLAUDE.md rule 10) does not apply.
 *
 * Courtesy rate-limit (fail-open) — the real authorization boundary is the access gate
 * below + the short single-use vendor token, NOT this limiter (§3).
 */
const ssoRateLimiter = createDistributedRateLimiter("partner-discount-sso", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
});

export async function POST(request: NextRequest) {
  try {
    // 🚦 GO-LIVE GATE — keeps users out of the portal until rewards SSO is cleared to launch.
    // Inert in production: returns 404 unless PARTNER_DISCOUNT_SSO_ENABLED=true. Flip that env
    // flag (Vercel) ONLY after the vendor deprovisioning + member_level answers are in — see
    // docs/auth/igodirect-sso-implementation-plan.md "Go-live gate". Always enabled in local
    // dev so the /dev/rewards-sso harness works. DEFAULT-SAFE by design: prod stays a 404 even
    // if everyone forgets — that's the whole point.
    if (process.env.NODE_ENV !== "development" && process.env.PARTNER_DISCOUNT_SSO_ENABLED !== "true") {
      // Body copy is customer-facing (surfaced inline by usePartnerDiscountSso consumers);
      // status stays 404 — the route is deliberately hidden while the flag is dark.
      return NextResponse.json(
        { success: false, error: "The partner portal isn't available right now." },
        { status: 404 }
      );
    }

    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await ssoRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": rateCheck.retryAfterSeconds.toString() } }
      );
    }

    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    // Reconcile-then-read: promote any due-but-unswept access, then gate on live access.
    const decision = await reconcilePartnerDiscountAccess(user);
    if (!decision.hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Your partner access isn't active right now. You can check it on My Account → Rewards.",
        },
        { status: 403 }
      );
    }

    // member_level is intentionally NOT sent yet — gated on iGoDirect's encoding answer
    // (docs/auth/igodirect-sso-implementation-plan.md §5a). TO ENABLE: pass
    // `memberLevel: decision.memberLevel ? String(decision.memberLevel.percent) : undefined`
    // here and flip `memberLevelSent` below to that condition. The resolved tier is still
    // recorded in the issuance log regardless.
    const sso = await generatePortalSso({ user });

    await logSsoIssuance({
      userId: String(user._id),
      memberLevelPercent: decision.memberLevel?.percent ?? null,
      memberLevelSent: false,
      success: sso.ok,
      providerResponse: sso.providerResponse,
      providerResponseCode: sso.providerResponseCode,
    });

    if (!sso.ok) {
      return NextResponse.json(
        { success: false, error: "The partner portal is temporarily unavailable. Please try again shortly." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: { redirectUrl: sso.redirectUrl } });
  } catch (error) {
    console.error("[partner-discount/sso] error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong opening the partner portal. Please try again." },
      { status: 500 }
    );
  }
}
