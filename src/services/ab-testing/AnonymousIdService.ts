import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Anonymous ID Service
 * Manages server-generated anonymous IDs stored in HttpOnly cookies
 */
export class AnonymousIdService {
  private readonly COOKIE_NAME = "ta_anon_id";
  private readonly COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days in seconds

  /**
   * Generate a UUID v4-like string
   */
  private generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Get or create anonymous ID from cookie
   * Reads existing cookie or creates new one if not present
   */
  async getOrCreateAnonymousId(request: NextRequest): Promise<string> {
    const cookieStore = await cookies();
    const existingId = cookieStore.get(this.COOKIE_NAME);

    if (existingId?.value && existingId.value.startsWith("anon_")) {
      return existingId.value;
    }

    // Generate new anonymous ID
    const newId = `anon_${this.generateUUID()}`;

    // Note: In Next.js App Router, we can't set cookies directly in server components
    // The cookie will be set by the API route that calls this service
    return newId;
  }

  /**
   * Extract existing anonymous ID from request
   */
  extractAnonymousId(request: NextRequest): string | null {
    const cookie = request.cookies.get(this.COOKIE_NAME);
    
    if (cookie?.value && cookie.value.startsWith("anon_")) {
      return cookie.value;
    }

    return null;
  }

  /**
   * Get cookie settings for setting the anonymous ID
   */
  getCookieSettings() {
    const isProduction = process.env.NODE_ENV === "production";

    return {
      name: this.COOKIE_NAME,
      value: "", // Will be set by caller
      httpOnly: true,
      sameSite: "lax" as const,
      secure: isProduction,
      maxAge: this.COOKIE_MAX_AGE,
      path: "/",
    };
  }
}

export default new AnonymousIdService();

