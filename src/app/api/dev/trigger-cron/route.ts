/**
 * Development Testing Tool: Trigger Cron Job Manually
 *
 * GET /api/dev/trigger-cron
 *
 * Allows developers to trigger the major draw transition cron job manually
 * during development without waiting for Vercel's scheduled execution.
 *
 * Only available in development environment for security.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Only allow in development environment
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "This endpoint is only available in development mode",
      },
      { status: 403 }
    );
  }

  try {
    console.log("🧪 [DEV] Triggering major draw transition cron job...");

    // Get the base URL from the request
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    // Call the cron endpoint with the secret
    const cronUrl = `${baseUrl}/api/cron/major-draw-transition`;
    const cronSecret = process.env.CRON_SECRET || "dev-secret";

    const response = await fetch(cronUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const data = await response.json();

    console.log("🧪 [DEV] Cron job response:", data);

    return NextResponse.json(
      {
        success: true,
        message: "Cron job triggered successfully",
        cronResponse: data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🧪 [DEV] Error triggering cron job:", error);
    return NextResponse.json(
      {
        error: "Failed to trigger cron job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
