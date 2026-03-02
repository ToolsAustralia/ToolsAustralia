import { SignJWT, jwtVerify } from "jose";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const JWT_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "fallback-secret-key");

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
    .setExpirationTime("30d") // 30 days expiration
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify affiliate JWT token
 */
export async function verifyAffiliateToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
