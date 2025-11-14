import { NextResponse } from "next/server";
import { klaviyo } from "@/lib/klaviyo";

/**
 * GET /api/health/klaviyo
 * Health check endpoint for Klaviyo integration
 * Useful for monitoring and debugging in production
 */
export async function GET() {
  try {
    // Get configuration status
    const configStatus = klaviyo.getConfigStatus();

    // Test connectivity
    const connectionTest = await klaviyo.verifyConnection();

    // Determine overall health - be more lenient for API connectivity issues
    const isHealthy = configStatus.enabled && configStatus.hasApiKey && configStatus.warnings.length === 0;

    // Separate connectivity health from overall health
    const connectivityHealthy = connectionTest.success;

    const response = {
      status: isHealthy ? "healthy" : "unhealthy",
      connectivity: connectivityHealthy ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
      config: configStatus,
      connectivityTest: connectionTest,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        klaviyoMode: process.env.KLAVIYO_MODE,
        region: process.env.VERCEL_REGION || "unknown",
      },
      recommendations: [] as string[],
    };

    // Add recommendations based on the status
    if (!configStatus.hasApiKey) {
      response.recommendations.push("Set KLAVIYO_PRIVATE_API_KEY environment variable");
    }
    if (!configStatus.enabled) {
      response.recommendations.push("Set KLAVIYO_ENABLED=true to enable Klaviyo integration");
    }
    if (configStatus.warnings.length > 0) {
      response.recommendations.push(...configStatus.warnings);
    }
    if (!connectivityHealthy && connectionTest.error) {
      response.recommendations.push(`API connectivity issue: ${connectionTest.error}`);
    }

    // Log health status for monitoring
    if (isHealthy && connectivityHealthy) {
      console.log("✅ Klaviyo Health Check: FULLY HEALTHY", {
        mode: configStatus.mode,
        isProduction: configStatus.isProduction,
        status: response.status,
      });
    } else {
      console.warn("⚠️ Klaviyo Health Check: ISSUES DETECTED", {
        warnings: configStatus.warnings,
        connectivityError: connectionTest.error,
        mode: configStatus.mode,
        recommendations: response.recommendations,
      });
    }

    // Return 200 even if connectivity fails, but mark as unhealthy
    // This allows monitoring systems to track the health check endpoint itself
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("❌ Klaviyo health check failed:", error);

    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        recommendations: ["Check server logs for detailed error information"],
      },
      { status: 500 }
    );
  }
}
