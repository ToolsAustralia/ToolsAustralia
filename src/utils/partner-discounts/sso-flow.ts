/**
 * MyRewards/iGoDirect SSO token exchange + issuance logging.
 *
 *  - `generatePortalSso` — sign our JWT, POST it to `/generatetoken`, and build the
 *    `/verifytoken/{token}` redirect URL the member is sent to. Server-side only.
 *  - `logSsoIssuance` — best-effort, PII-safe audit write (never throws, never blocks
 *    the hand-off — see N9).
 *
 * The secret is read inside the signer (`signPartnerDiscountSsoToken`); the non-secret
 * tenant identifiers come from env here. See docs/auth/igodirect-sso-implementation-plan.md.
 *
 * @module utils/partner-discounts/sso-flow
 */

import type { IUser } from "@/models/User";
import { signPartnerDiscountSsoToken } from "@/lib/partner-discount-sso";
import { resilientFetch } from "@/lib/http/outbound";
import PartnerDiscountSsoIssuance from "@/models/PartnerDiscountSsoIssuance";

/** MyRewards-issued tenant config (non-secret). Fail loud if unset — never guess. */
function requireTenantConfig(): { domainUrl: string; domainCode: string; clientId: number } {
  const domainUrl = process.env.IGODIRECT_DOMAIN_URL;
  const domainCode = process.env.IGODIRECT_DOMAIN_CODE;
  const clientIdRaw = process.env.IGODIRECT_CLIENT_ID;
  if (!domainUrl || !domainCode || !clientIdRaw) {
    throw new Error(
      "IGODIRECT_DOMAIN_URL, IGODIRECT_DOMAIN_CODE and IGODIRECT_CLIENT_ID must all be set for MyRewards SSO."
    );
  }
  const clientId = Number(clientIdRaw);
  if (!Number.isFinite(clientId)) {
    throw new Error(`IGODIRECT_CLIENT_ID must be numeric, got "${clientIdRaw}".`);
  }
  return { domainUrl, domainCode, clientId };
}

export interface PortalSsoResult {
  /** Whether `/generatetoken` accepted the token and returned a portal login token. */
  ok: boolean;
  /** The URL to redirect the member to (empty when `ok` is false). */
  redirectUrl: string;
  /** MyRewards' `response` string (e.g. "User found"), if present. */
  providerResponse?: string;
  /** HTTP status from `/generatetoken`. */
  providerResponseCode: number;
}

/**
 * Mint a MyRewards SSO hand-off for `user`.
 *
 * PII boundary (§3): we send ONLY the opaque `member_id` — email/firstname/lastname are
 * intentionally omitted until a deletion path / DPA is confirmed with the vendor.
 *
 * `memberLevel` is intentionally OPTIONAL and OMITTED by the SSO route today — see the
 * route's call site. To enable it once iGoDirect confirms the encoding (§5a), pass the
 * resolved tier string here; the signer slots it into the payload with no other change.
 */
export async function generatePortalSso(params: { user: IUser; memberLevel?: string }): Promise<PortalSsoResult> {
  const { domainUrl, domainCode, clientId } = requireTenantConfig();

  const token = await signPartnerDiscountSsoToken({
    memberId: String(params.user._id),
    memberLevel: params.memberLevel,
    domainUrl,
    domainCode,
    clientId,
    clientDisplayName: "Tools Australia",
  });

  const res = await resilientFetch(
    `https://${domainUrl}/generatetoken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ data: token }),
    },
    { label: "igodirect-generatetoken" }
  );

  const bodyText = await res.text();
  let portalToken: string | undefined;
  let providerResponse: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as { token?: unknown; response?: unknown };
    if (typeof parsed.token === "string") portalToken = parsed.token;
    if (typeof parsed.response === "string") providerResponse = parsed.response;
  } catch {
    // Non-JSON body — leave portalToken undefined so this is treated as a failure.
  }

  if (!res.ok || !portalToken) {
    return { ok: false, redirectUrl: "", providerResponse, providerResponseCode: res.status };
  }

  return {
    ok: true,
    redirectUrl: `https://${domainUrl}/verifytoken/${portalToken}`,
    providerResponse,
    providerResponseCode: res.status,
  };
}

export interface SsoIssuanceLogEntry {
  userId: string;
  memberLevelPercent: number | null;
  memberLevelSent: boolean;
  success: boolean;
  providerResponse?: string;
  providerResponseCode?: number;
  errorCode?: string;
}

/**
 * Best-effort audit write — NEVER throws, so a logging failure can't block the member's
 * hand-off (N9). PII-safe: opaque `userId` only; no raw token is ever stored.
 */
export async function logSsoIssuance(entry: SsoIssuanceLogEntry): Promise<void> {
  try {
    await PartnerDiscountSsoIssuance.create({
      userId: entry.userId,
      memberLevelPercent: entry.memberLevelPercent ?? undefined,
      memberLevelSent: entry.memberLevelSent,
      success: entry.success,
      providerResponse: entry.providerResponse,
      providerResponseCode: entry.providerResponseCode,
      errorCode: entry.errorCode,
    });
  } catch (err) {
    console.error("[partner-sso] failed to write SSO issuance log (non-blocking):", err);
  }
}
