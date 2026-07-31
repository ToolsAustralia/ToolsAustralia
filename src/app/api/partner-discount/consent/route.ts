import { NextRequest, NextResponse } from "next/server";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { PARTNER_SSO_ERRORS } from "@/utils/partner-discounts/sso-access";
import {
  buildPartnerSsoSharedFields,
  recordPartnerConsent,
} from "@/utils/partner-discounts/partner-consent";

/**
 * POST /api/partner-discount/consent
 *
 * Records the member's agreement to share the disclosed fields with the MyRewards
 * portal. Identity comes from the NextAuth session (no body) — the client cannot
 * choose WHICH fields it consented to, because that would let a tampered client
 * record consent for a narrower set than the hand-off actually sends. The server
 * re-derives the field list from `buildPartnerSsoSharedFields`, the same source the
 * consent sheet was rendered from. Thin handler — logic lives in
 * `utils/partner-discounts/partner-consent`. NOT an admin route, so Norm lockstep
 * (CLAUDE.md rule 10) does not apply.
 *
 * The write is NOT best-effort (unlike the SSO issuance log): if we cannot record
 * consent we must not pretend we did, so a failure is a 500 and the member stays on
 * the sheet.
 */
const consentRateLimiter = createDistributedRateLimiter("partner-discount-consent", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
});

export async function POST(request: NextRequest) {
  try {
    // Same go-live gate as the SSO route — consent is meaningless while the portal is dark.
    if (process.env.NODE_ENV !== "development" && process.env.PARTNER_DISCOUNT_SSO_ENABLED !== "true") {
      return NextResponse.json({ success: false, error: PARTNER_SSO_ERRORS.flagDark }, { status: 404 });
    }

    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await consentRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: PARTNER_SSO_ERRORS.rateLimited },
        { status: 429, headers: { "Retry-After": rateCheck.retryAfterSeconds.toString() } }
      );
    }

    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    // Server-derived, not client-supplied — the record must describe what we actually send.
    const fields = buildPartnerSsoSharedFields(user).map((f) => f.key);
    const record = await recordPartnerConsent(user, fields);

    return NextResponse.json({
      success: true,
      data: { scopeVersion: record.scopeVersion, acceptedAt: record.acceptedAt.toISOString() },
    });
  } catch (error) {
    console.error("[partner-discount/consent] error:", error);
    return NextResponse.json({ success: false, error: PARTNER_SSO_ERRORS.unknown }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
