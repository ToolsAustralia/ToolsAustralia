/**
 * Cryptographically secure nonce generation for Content Security Policy.
 *
 * Nonces are used to allow specific inline scripts (like JSON-LD structured data)
 * while maintaining strict CSP without 'unsafe-inline'.
 *
 * Best practices:
 * - Generate a unique nonce per HTTP request
 * - Use cryptographically secure random bytes
 * - Base64url encode for safe use in HTML attributes and headers
 * - Minimum 16 bytes (128 bits) for security
 *
 * Uses Web Crypto API for Edge Runtime compatibility (middleware runs in Edge Runtime).
 * This ensures the function works in both Node.js server components and Edge Runtime middleware.
 */

/**
 * Generates a cryptographically secure nonce for CSP.
 *
 * Uses Web Crypto API which is available in both Node.js and Edge Runtime.
 * This ensures compatibility with Next.js middleware which runs in Edge Runtime.
 *
 * @param length - Number of random bytes to generate (default: 16, minimum recommended: 16)
 * @returns Base64url-encoded nonce string safe for use in HTML attributes and HTTP headers
 *
 * @example
 * const nonce = generateNonce();
 * // Use in CSP: script-src 'nonce-{nonce}'
 * // Use in script tag: <script nonce={nonce}>
 */
export function generateNonce(length: number = 16): string {
  if (length < 16) {
    throw new Error("Nonce length must be at least 16 bytes for security");
  }

  // Use Web Crypto API (available in Edge Runtime and Node.js)
  // This is the standard web API for cryptographic operations
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  // Convert Uint8Array to base64url (URL-safe base64, no padding)
  // This encoding is safe for use in HTML attributes and HTTP headers
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
