import { cookies } from "next/headers";
import { verifyAffiliateToken, AFFILIATE_COOKIE_NAME } from "@/lib/affiliate-auth";

/**
 * Get current affiliate session from cookie
 * Returns null if not authenticated
 */
export async function getAffiliateSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AFFILIATE_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const payload = await verifyAffiliateToken(token);
    return payload;
  } catch {
    return null;
  }
}


