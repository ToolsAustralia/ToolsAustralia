/**
 * iGoDirect / MyRewards SSO signer — "Tools Australia Rewards (TAR)" partner-discount portal.
 *
 * Mints the HS256 JWT that goes in the `{"data":"<jwt>"}` body of
 * `POST https://<domain_url>/generatetoken`. MyRewards then returns a short-lived
 * token we redirect the member to at `GET /verifytoken/{token}` to log them into
 * the portal.
 *
 * WHY A DEDICATED SIGNER (not src/lib/jwt.ts, not the affiliate/NextAuth signers):
 * this token uses MyRewards' OWN secret (`IGODIRECT_SSO_SECRET`), their claim set,
 * and their TTL model — keeping the MyRewards crypto domain fully isolated from our
 * member/affiliate session tokens (a member token can never be replayed here, and
 * the secret can be rotated independently). Reusing `signJWT()` would be the wrong
 * secret, wrong claims, and a 30-day expiry. Server-side ONLY — the secret must
 * never reach the client.
 *
 * Field names + order mirror MyRewards' documented sample payload exactly.
 * `member_level` (our access-% tier) is OPTIONAL in their spec and is omitted for
 * now — the tier-mapping/encoding is still being settled with iGoDirect. Pass
 * `memberLevel` to include it later; it slots into the payload without any other
 * change. Their `data` JWT carries NO exp/iat — the 60-minute TTL is enforced by
 * THEIR server on the token it returns — so we deliberately set no expiry here.
 *
 * See docs/auth/igodirect-sso-masterplan.md and docs/partner/ for the full plan.
 *
 * @module lib/partner-discount-sso
 */

import { SignJWT } from "jose";

export interface PartnerDiscountSsoClaims {
  /** Stable, non-PII member identifier — our opaque `User._id` in production. */
  memberId: string;
  /** MyRewards-issued tenant config (env `IGODIRECT_DOMAIN_URL`). */
  domainUrl: string;
  /** MyRewards-issued tenant config (env `IGODIRECT_DOMAIN_CODE`). */
  domainCode: string;
  /** MyRewards-issued tenant config (env `IGODIRECT_CLIENT_ID`). Numeric per their spec. */
  clientId: number;
  /** Optional profile fields — sent only when we have them. */
  firstname?: string;
  lastname?: string;
  email?: string;
  /** Optional tier (our effective access-%). Omitted until MyRewards confirms encoding. */
  memberLevel?: string;
  /** Optional display name for our brand inside their portal. */
  clientDisplayName?: string;
}

/**
 * Read the secret at CALL time (not module load) so a `tsx` script that runs
 * `dotenv.config()` after its hoisted imports still sees it. Fail loud if unset —
 * never sign with a silent fallback secret.
 */
function getSecretKey(): Uint8Array {
  const raw = process.env.IGODIRECT_SSO_SECRET;
  if (!raw) {
    throw new Error(
      "IGODIRECT_SSO_SECRET is required to sign a MyRewards SSO token but was not provided."
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Sign the MyRewards SSO JWT (the `data` value for `POST /generatetoken`).
 *
 * HS256 over `IGODIRECT_SSO_SECRET`, claims in MyRewards' documented order.
 */
export async function signPartnerDiscountSsoToken(claims: PartnerDiscountSsoClaims): Promise<string> {
  const payload: Record<string, string | number> = { member_id: claims.memberId };
  if (claims.firstname !== undefined) payload.firstname = claims.firstname;
  if (claims.lastname !== undefined) payload.lastname = claims.lastname;
  if (claims.email !== undefined) payload.email = claims.email;
  if (claims.memberLevel !== undefined) payload.member_level = claims.memberLevel;
  payload.domain_url = claims.domainUrl;
  payload.domain_code = claims.domainCode;
  payload.client_id = claims.clientId;
  if (claims.clientDisplayName !== undefined) payload.client_displayname = claims.clientDisplayName;

  return new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(getSecretKey());
}
