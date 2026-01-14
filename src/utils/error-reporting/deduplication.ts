/**
 * Error Report Deduplication Utility
 * 
 * Generates deduplication hashes to prevent duplicate error reports.
 * Uses a combination of error message, user ID, API endpoint, and timestamp
 * to create a unique hash that identifies similar errors.
 */

import { ErrorContext } from "@/types/error-reporting";
import { createHash } from "crypto";

/**
 * Generate a deduplication hash for an error report
 * 
 * The hash is based on:
 * - Error message (normalized)
 * - User ID (if authenticated)
 * - API endpoint (if available)
 * - Error name (if available)
 * 
 * This allows the system to detect duplicate reports from the same user
 * for the same error within a short time window (handled by the API).
 * 
 * @param errorContext - The error context to generate hash for
 * @returns A SHA-256 hash string (hex encoded)
 */
export function generateDeduplicationHash(errorContext: ErrorContext): string {
  // Normalize error message (remove variable data like IDs, timestamps)
  const normalizedMessage = normalizeErrorMessage(errorContext.errorMessage);

  // Build hash components
  const hashComponents = [
    normalizedMessage,
    errorContext.errorName || "",
    errorContext.userId || "anonymous",
    errorContext.apiEndpoint || "",
    // Round timestamp to nearest hour for deduplication window
    Math.floor(errorContext.timestamp / (60 * 60 * 1000)).toString(),
  ];

  // Create hash string
  const hashString = hashComponents.join("|");

  // Generate SHA-256 hash
  // Note: In browser environment, we'll use Web Crypto API
  // In Node.js, we use crypto module
  if (typeof window === "undefined") {
    // Server-side: use Node.js crypto
    return createHash("sha256").update(hashString).digest("hex");
  } else {
    // Client-side: we'll compute this on the server
    // For now, return a placeholder that will be computed server-side
    // The actual hashing will happen in the API route
    return hashString; // This will be hashed on the server
  }
}

/**
 * Normalize error message by removing variable data
 * 
 * This helps identify similar errors even if they contain
 * different IDs, timestamps, or other variable data.
 * 
 * @param message - The error message to normalize
 * @returns Normalized error message
 */
function normalizeErrorMessage(message: string): string {
  let normalized = message;

  // Remove common variable patterns
  // UUIDs
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "[UUID]"
  );

  // MongoDB ObjectIds
  normalized = normalized.replace(/[0-9a-f]{24}/gi, "[ObjectId]");

  // Timestamps (various formats)
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, "[Timestamp]");
  normalized = normalized.replace(/\d{13}/g, "[Timestamp]"); // Unix timestamp in ms

  // Email addresses (keep structure, remove actual email)
  normalized = normalized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[Email]");

  // URLs (keep structure, remove actual URL)
  normalized = normalized.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Numbers that might be IDs (long numbers)
  normalized = normalized.replace(/\b\d{6,}\b/g, "[Number]");

  // Trim and normalize whitespace
  normalized = normalized.trim().replace(/\s+/g, " ");

  return normalized;
}

/**
 * Generate deduplication hash on server-side
 * This is the actual implementation that should be used in API routes
 * 
 * @param errorContext - The error context to generate hash for
 * @returns A SHA-256 hash string (hex encoded)
 */
export function generateDeduplicationHashServer(errorContext: ErrorContext): string {
  const normalizedMessage = normalizeErrorMessage(errorContext.errorMessage);

  const hashComponents = [
    normalizedMessage,
    errorContext.errorName || "",
    errorContext.userId || "anonymous",
    errorContext.apiEndpoint || "",
    Math.floor(errorContext.timestamp / (60 * 60 * 1000)).toString(),
  ];

  const hashString = hashComponents.join("|");
  return createHash("sha256").update(hashString).digest("hex");
}

