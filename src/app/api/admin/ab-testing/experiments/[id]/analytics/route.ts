import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";
import ExperimentStoppingRulesService from "@/services/ab-testing/ExperimentStoppingRulesService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/ab-testing/experiments/[id]/analytics
 * Get analytics data for experiment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: experimentId } = await params;
    const { searchParams } = new URL(request.url);

    // Parse date range
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const variantId = searchParams.get("variantId") || undefined;

    const dateRange =
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined;

    // Get analytics data
    if (variantId) {
      // Get metrics for specific variant
      const metrics = await ExperimentAnalyticsService.getVariantMetrics(experimentId, variantId, dateRange);
      const funnel = await ExperimentAnalyticsService.getFunnelMetrics(variantId, dateRange);
      const dropOff = await ExperimentAnalyticsService.getDropOffRates(variantId, dateRange);

      return NextResponse.json({
        success: true,
        data: {
          variantId,
          metrics,
          funnel,
          dropOff,
        },
      });
    } else {
      // Get comparison for all variants
      const comparison = await ExperimentAnalyticsService.getExperimentComparison(experimentId, dateRange);
      const significance = await ExperimentAnalyticsService.getStatisticalSignificance(experimentId, dateRange);
      const stoppingRules = await ExperimentStoppingRulesService.evaluateStoppingRules(experimentId);

      return NextResponse.json({
        success: true,
        data: {
          comparison,
          significance,
          stoppingRules,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

