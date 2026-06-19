import { SignJWT, jwtVerify } from "jose";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

// Affiliate tokens use their OWN secret so the affiliate auth domain is
// cryptographically separate from the member/NextAuth domain: a member token can
// never be replayed as an affiliate token, and the two can be rotated
// independently. Prefer AFFILIATE_JWT_SECRET; fall back to NEXTAUTH_SECRET so the
// system keeps working until the dedicated secret is provisioned. Never a
// hard-coded literal — fail fast if neither is set.
const rawAffiliateSecret = process.env.AFFILIATE_JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!rawAffiliateSecret) {
  throw new Error(
    "AFFILIATE_JWT_SECRET (or NEXTAUTH_SECRET) is required for affiliate JWT operations but neither was provided."
  );
}
const JWT_SECRET = new TextEncoder().encode(rawAffiliateSecret);

// Crypto domain separation: affiliate tokens carry a distinct issuer/audience,
// enforced on verify, so a member/NextAuth token cannot satisfy an affiliate check.
const AFFILIATE_JWT_ISSUER = "tools-australia";
const AFFILIATE_JWT_AUDIENCE = "tools-australia-affiliates";

// `__Host-` requires Secure + Path=/ + no Domain (which the login route sets in
// production). In local dev over http, Secure cookies are rejected, so fall back
// to the unprefixed name. Read/written/cleared via this single constant.
const useSecureAffiliateCookie = process.env.NODE_ENV === "production";
export const AFFILIATE_COOKIE_NAME = useSecureAffiliateCookie ? "__Host-affiliate_token" : "affiliate_token";

/**
 * Create JWT token for affiliate session
 */
export async function createAffiliateToken(affiliate: { _id: string; email: string; username: string; name: string }) {
  const token = await new SignJWT({
    affiliateId: affiliate._id,
    email: affiliate.email,
    username: affiliate.username,
    name: affiliate.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(AFFILIATE_JWT_ISSUER)
    .setAudience(AFFILIATE_JWT_AUDIENCE)
    .setExpirationTime("30d") // 30 days expiration
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify affiliate JWT token
 */
export async function verifyAffiliateToken(token: string) {
  try {
    // Pin the algorithm and enforce the affiliate issuer/audience so only an
    // affiliate-domain token is accepted here.
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: AFFILIATE_JWT_ISSUER,
      audience: AFFILIATE_JWT_AUDIENCE,
    });

    const affiliateId = typeof payload.affiliateId === "string" ? payload.affiliateId : undefined;
    if (!affiliateId) {
      return null;
    }

    // Revocation: re-check the affiliate on every verify so a deactivated/banned
    // affiliate's token stops working immediately instead of lingering until the
    // token's natural expiry.
    await connectDB();
    const affiliate = await Affiliate.findById(affiliateId).select("isActive");
    if (!affiliate || affiliate.isActive === false) {
      return null;
    }

    return payload as {
      affiliateId: string;
      email: string;
      username: string;
      name: string;
    };
  } catch {
    return null;
  }
}

/**
 * Authenticate affiliate with username and password
 */
export async function authenticateAffiliate(username: string, password: string) {
  await connectDB();

  const affiliate = await Affiliate.findOne({
    username: username.toLowerCase().trim(),
    isActive: true,
  });

  if (!affiliate) {
    return null;
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, affiliate.password);
  if (!isPasswordValid) {
    return null;
  }

  const affiliateId = (affiliate._id as mongoose.Types.ObjectId).toString();

  return {
    _id: affiliateId,
    email: affiliate.email,
    username: affiliate.username,
    name: affiliate.name,
  };
}
