import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { reconcilePartnerDiscountAccess } from "@/utils/partner-discounts/sso-access";
import {
  buildMemberStatusResponse,
  validateMemberId,
  verifyMemberStatusBearer,
} from "@/utils/partner-discounts/member-status";

/**
 * GET /api/partner-discount/member-status?member_id=<id>[&event=sign_in|page_load|redeem]
 *
 * Vendor-facing read for iGoDirect's MyRewards portal: called at SSO sign-in, page
 * load, and offer redemption to read a member's LIVE partner-discount access. We are
 * the source of truth; the answer is reconcile-then-read (promotes due-but-unswept
 * paid access) so it is always current — never cache it (`no-store` on every response,
 * `force-dynamic` below). The wire contract `{ active, member_level, expires_at }` is
 * FIXED with the vendor — additive changes only. Thin handler — the pure logic lives
 * in `utils/partner-discounts/{member-status,sso-access}`. NOT an admin route, so Norm
 * lockstep (CLAUDE.md rule 10) does not apply.
 *
 * `event` is observability-only (it rides in the access logs); it never changes the
 * answer, so the handler deliberately does not branch on it.
 *
 * Auth: single static bearer (`IGODIRECT_MEMBER_STATUS_KEY`), constant-time compare,
 * fail-loud on missing config. The rate limiter is a courtesy cap sized for the
 * vendor's aggregate server-side volume (their calls funnel through a few egress
 * IPs) — it fails open by design; the bearer is the boundary (plan §3).
 *
 * See docs/partner/igodirect-member-status-api-plan.md.
 */

// Accuracy is the whole point of this endpoint — opt out of any static/ISR caching.
export const dynamic = "force-dynamic";

const memberStatusRateLimiter = createDistributedRateLimiter("partner-discount-member-status", {
  windowMs: 60 * 1000,
  maxRequests: 600,
});

function noStoreJson(body: unknown, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function GET(request: NextRequest) {
  try {
    // 🚦 GO-LIVE GATE — 503 in production unless IGODIRECT_MEMBER_STATUS_ENABLED=true;
    // always on in local dev. Same enforced-in-code pattern as the SSO route's gate:
    // default-dark so prod stays disabled even if everyone forgets.
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.IGODIRECT_MEMBER_STATUS_ENABLED !== "true"
    ) {
      return noStoreJson({ error: "disabled" }, 503);
    }

    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await memberStatusRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return noStoreJson({ error: "rate_limited" }, 429, {
        "Retry-After": rateCheck.retryAfterSeconds.toString(),
      });
    }

    const auth = verifyMemberStatusBearer(request.headers.get("authorization"));
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        console.error(
          "[member-status] IGODIRECT_MEMBER_STATUS_KEY is not set — refusing to serve (fail closed)"
        );
        return noStoreJson({ error: "server_error" }, 500);
      }
      return noStoreJson({ error: "unauthorized" }, 401);
    }

    const memberId = validateMemberId(request.nextUrl.searchParams.get("member_id"));
    if (!memberId) {
      return noStoreJson({ error: "invalid_member_id" }, 400);
    }

    await connectDB();
    const user = await User.findById(memberId);
    if (!user) {
      return noStoreJson({ error: "unknown_member" }, 404);
    }

    // Reconcile-then-read: promote any due-but-unswept paid access, THEN answer.
    // A bare read would wrongly deny members whose pack hasn't been swept active.
    const decision = await reconcilePartnerDiscountAccess(user);
    const body = buildMemberStatusResponse(decision);

    if (body.active && body.member_level === null) {
      // Fail-closed tier anomaly: access is live but no plan resolved. The vendor
      // treats null as minimal access; we must notice and fix the data.
      console.error(`[member-status] active member with unresolved tier (member_id=${memberId})`);
    }

    return noStoreJson(body, 200);
  } catch (error) {
    console.error("[member-status] error:", error);
    return noStoreJson({ error: "server_error" }, 500);
  }
}
