import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/ab-testing/experiments/[id]/analytics
 * Get analytics data for experiment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const guard = await requirePermission("abTesting.view");
    if (guard instanceof NextResponse) return guard;

    const { id: experimentId } = await params;
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const variantId = searchParams.get("variantId") || undefined;

    const dateRange =
      startDate && endDate
        ? { startDate: new Date(startDate), endDate: new Date(endDate) }
        : undefined;

    const summary = await ExperimentAnalyticsService.getExperimentAnalyticsSummary(
      experimentId,
      dateRange,
      variantId
    );

    if (summary.kind === "variant") {
      return NextResponse.json({
        success: true,
        data: {
          variantId: summary.variantId,
          metrics: summary.metrics,
          funnel: summary.funnel,
          dropOff: summary.dropOff,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        comparison: summary.comparison,
        significance: summary.significance,
        stoppingRules: summary.stoppingRules,
        winner: summary.winner,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    if (error instanceof Error && error.message === "experiment_not_found") {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

