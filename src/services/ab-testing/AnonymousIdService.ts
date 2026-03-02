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
   * Validate anonymous ID format
   */
  private isValidAnonymousId(id: string): boolean {
    return id.startsWith("anon_") && id.length > 5 && id.length < 100;
  }

  /**
   * Get or create anonymous ID from cookie
   * Reads existing cookie or creates new one if not present
   * Validates and regenerates if corrupted
   */
  async getOrCreateAnonymousId(_request: NextRequest): Promise<string> {
    const cookieStore = await cookies();
    const existingId = cookieStore.get(this.COOKIE_NAME);

    // Validate existing cookie
    if (existingId?.value && this.isValidAnonymousId(existingId.value)) {
      return existingId.value;
    }

    // If cookie exists but is invalid, log warning (but don't fail)
    if (existingId?.value && !this.isValidAnonymousId(existingId.value)) {
      console.warn(
        `[A/B Testing] Invalid anonymous ID cookie format detected: ${existingId.value.substring(0, 20)}..., regenerating...`
      );
    }

    // Generate new anonymous ID
    const newId = `anon_${this.generateUUID()}`;

    // Note: In Next.js App Router, we can't set cookies directly in server components
    // The cookie will be set by the API route that calls this service
    return newId;
  }

  /**
   * Extract existing anonymous ID from request
   * Validates format and returns null if invalid
   */
  extractAnonymousId(request: NextRequest): string | null {
    const cookie = request.cookies.get(this.COOKIE_NAME);
    
    if (cookie?.value && this.isValidAnonymousId(cookie.value)) {
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

const anonymousIdService = new AnonymousIdService();
export default anonymousIdService;

