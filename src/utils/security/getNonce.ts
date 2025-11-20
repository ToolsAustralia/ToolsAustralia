/**
 * Server-side utility to retrieve the nonce from request headers.
 *
 * This should ONLY be called from server components or server actions.
 * The nonce is set by middleware and passed via request headers.
 *
 * @returns The nonce string if available, undefined otherwise
 * @throws Error if called from client-side code
 */

import { headers } from "next/headers";

/**
 * Retrieves the CSP nonce from request headers (server-side only).
 *
 * The nonce is generated in middleware and attached to the request.
 * This function reads it for use in server components that render JSON-LD.
 *
 * @returns Nonce string if available, undefined if not set
 *
 * @example
 * // In a server component:
 * const nonce = getNonce();
 * return <StructuredData data={schema} nonce={nonce} />;
 */
export async function getNonce(): Promise<string | undefined> {
  // Verify we're on the server (Next.js headers() only works server-side)
  if (typeof window !== "undefined") {
    throw new Error("getNonce() can only be called from server components");
  }

  const headersList = await headers();
  return headersList.get("x-nonce") || undefined;
}
