/**
 * Error Reports API
 * 
 * Handles creation of error reports from users.
 * Includes rate limiting, deduplication, and privacy protection.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ErrorReport from "@/models/ErrorReport";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkErrorReportRateLimit } from "@/lib/rate-limiting/error-reports";
import { generateDeduplicationHashServer, generateCategoryAwareDeduplicationHash } from "@/utils/error-reporting/deduplication";
import { ErrorContext } from "@/types/error-reporting";
import crypto from "crypto";

/**
 * Validation schema for creating an error report
 */
const createErrorReportSchema = z.object({
  errorContext: z.object({
    errorMessage: z.string().min(1).max(2000),
    errorStack: z.string().max(10000).optional(),
    errorName: z.string().max(200).optional(),
    apiEndpoint: z.string().max(500).optional(),
    httpMethod: z.string().optional(),
    httpStatus: z.number().min(100).max(599).optional(),
    requestUrl: z.string().max(2000).optional(),
    userId: z.string().optional(),
    userEmail: z.string().email().optional(),
    guestEmail: z.string().email().optional(), // NEW: Guest user email
    isAuthenticated: z.boolean(),
    userAgent: z.string().max(500).optional(),
    browserInfo: z
      .object({
        name: z.string().optional(),
        version: z.string().optional(),
        os: z.string().optional(),
      })
      .optional(),
    currentUrl: z.string().max(2000).optional(),
    route: z.string().max(500).optional(),
    referrer: z.string().max(2000).optional(),
    consoleErrors: z
      .array(
        z.object({
          message: z.string(),
          source: z.string().optional(),
          line: z.number().optional(),
          column: z.number().optional(),
          timestamp: z.number(),
        })
      )
      .optional(),
    timestamp: z.number(),
    timezone: z.string().optional(),
  }),
  userNotes: z.string().max(2000).optional(),
  // Auto-logging options
  autoLogged: z.boolean().optional(),
  category: z.enum(["payment", "network", "api", "system", "recovery"]).optional(),
  severity: z.enum(["critical", "high", "medium"]).optional(),
  skipRateLimit: z.boolean().optional(),
  skipDeduplication: z.boolean().optional(),
});

/**
 * Hash IP address for privacy protection
 * Uses SHA-256 to create a one-way hash
 */
function hashIPAddress(ip: string): string {
  return crypto.createHash("sha256").update(ip.trim().toLowerCase()).digest("hex");
}

/**
 * Sanitize user notes to prevent XSS
 * Removes potentially dangerous HTML/script tags
 */
function sanitizeUserNotes(notes: string | undefined): string | undefined {
  if (!notes) return undefined;

  // Remove HTML tags and encode special characters
  return notes
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&/g, "&amp;") // Encode ampersands
    .replace(/</g, "&lt;") // Encode less-than
    .replace(/>/g, "&gt;") // Encode greater-than
    .replace(/"/g, "&quot;") // Encode quotes
    .replace(/'/g, "&#x27;") // Encode apostrophes
    .trim();
}

/**
 * POST /api/error-reports
 * Create a new error report
 * 
 * Features:
 * - Rate limiting (5 reports/hour for authenticated, 3/hour for anonymous)
 * - Deduplication (prevents duplicate reports)
 * - Privacy protection (hashes IP addresses)
 * - Input sanitization (prevents XSS)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createErrorReportSchema.parse(body);

    // Get session to determine if user is authenticated
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const userEmail = session?.user?.email;

    // Verify that errorContext matches session (if authenticated)
    if (userId && validatedData.errorContext.userId && validatedData.errorContext.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "User ID mismatch" },
        { status: 400 }
      );
    }

    // ✅ ENHANCED: Update error context with actual session data and guest email
    const isAuthenticated = !!userId;
    // Prioritize authenticated user email over guest email
    const finalUserEmail = userEmail || (isAuthenticated ? validatedData.errorContext.userEmail : undefined);
    const finalGuestEmail = !isAuthenticated ? (validatedData.errorContext.guestEmail || validatedData.errorContext.userEmail) : undefined;

    const errorContext: ErrorContext = {
      ...validatedData.errorContext,
      userId: userId || validatedData.errorContext.userId,
      userEmail: finalUserEmail,
      guestEmail: finalGuestEmail, // ✅ NEW: Include guest email
      isAuthenticated,
    };

    // ✅ ENHANCED: Check rate limiting with severity support (skip for auto-logged critical errors)
    const shouldSkipRateLimit = validatedData.autoLogged && validatedData.skipRateLimit;
    if (!shouldSkipRateLimit) {
      const rateLimitCheck = checkErrorReportRateLimit(
        userId,
        request,
        validatedData.severity as "critical" | "high" | "medium" | undefined
      );
      if (!rateLimitCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "Rate limit exceeded",
            message: `You've submitted too many error reports. Please wait before submitting again.`,
            retryAfterSeconds: rateLimitCheck.retryAfterSeconds,
            rateLimited: true,
          },
          { status: 429 }
        );
      }
    }

    // ✅ ENHANCED: Generate category-aware deduplication hash
    const category = validatedData.category;
    const severity = validatedData.severity;
    
    // Use category-specific time windows for deduplication
    // Payment errors: 30 minutes (more frequent, need faster detection)
    // Network errors: 2 hours (less frequent, can wait longer)
    // Other errors: 1 hour (default)
    const timeWindowHours = category === "payment" ? 0.5 : category === "network" ? 2 : 1;
    
    const deduplicationHash = generateCategoryAwareDeduplicationHash(
      errorContext,
      category,
      severity,
      timeWindowHours
    );

    // ✅ ENHANCED: Check if a duplicate report exists with category-aware time window
    const shouldSkipDeduplication = validatedData.autoLogged && validatedData.skipDeduplication;
    if (!shouldSkipDeduplication) {
      const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
      const existingReport = await ErrorReport.findOne({
        deduplicationHash,
        createdAt: {
          $gte: new Date(Date.now() - timeWindowMs), // Category-specific time window
        },
      }).lean();

      if (existingReport && !Array.isArray(existingReport)) {
        // Duplicate report - return success but indicate it's a duplicate
        const reportId =
          existingReport._id && typeof existingReport._id === "object" && "toString" in existingReport._id
            ? existingReport._id.toString()
            : String(existingReport._id || "");
        return NextResponse.json({
          success: true,
          message: "This error has already been reported recently",
          isDuplicate: true,
          reportId,
        });
      }
    }

    // Get IP address and hash it for privacy
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const ipAddressHash = hashIPAddress(ipAddress);

    // Sanitize user notes
    const sanitizedNotes = sanitizeUserNotes(validatedData.userNotes);

    // Create error report
    const errorReport = new ErrorReport({
      userId: userId ? userId : undefined,
      userEmail: errorContext.userEmail,
      guestEmail: errorContext.guestEmail, // ✅ NEW: Store guest email
      isAuthenticated: errorContext.isAuthenticated,
      errorMessage: errorContext.errorMessage,
      errorStack: errorContext.errorStack,
      errorName: errorContext.errorName,
      category: validatedData.category, // ✅ NEW: Store error category
      severity: validatedData.severity, // ✅ NEW: Store error severity
      autoLogged: validatedData.autoLogged || false, // ✅ NEW: Store auto-logged flag
      apiEndpoint: errorContext.apiEndpoint,
      httpMethod: errorContext.httpMethod,
      httpStatus: errorContext.httpStatus,
      requestUrl: errorContext.requestUrl,
      userNotes: sanitizedNotes,
      userAgent: errorContext.userAgent,
      browserInfo: errorContext.browserInfo,
      currentUrl: errorContext.currentUrl,
      route: errorContext.route,
      referrer: errorContext.referrer,
      consoleErrors: errorContext.consoleErrors,
      ipAddressHash,
      status: "new",
      deduplicationHash,
    });

    await errorReport.save();

    return NextResponse.json({
      success: true,
      message: "Error report submitted successfully",
      reportId: errorReport._id.toString(),
    });
  } catch (error) {
    console.error("Error creating error report:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: "Failed to submit error report",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

