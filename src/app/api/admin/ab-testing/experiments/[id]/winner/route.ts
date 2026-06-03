/**
 * Winner Selection API
 * 
 * POST /api/admin/ab-testing/experiments/[id]/winner
 * 
 * Declares a winner for an experiment and optionally ends it
 * 
 * Body:
 * {
 *   variantId: string, // ID of the winning variant
 *   endExperiment?: boolean, // Whether to end the experiment after declaring winner
 *   reason?: string // Optional reason for winner selection
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";
import ExperimentHistoryRepository from "@/repositories/ab-testing/ExperimentHistoryRepository";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const declareWinnerSchema = z.object({
  variantId: z.string().min(1, "Variant ID is required"),
  endExperiment: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

/**
 * POST /api/admin/ab-testing/experiments/[id]/winner
 * Declare a winner for an experiment
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: experimentId } = await params;
    const guard = await requirePermissionWithAudit("abTesting.selectWinner", request, {
      resourceType: "Experiment",
      resourceId: experimentId,
    });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;
    const body = await request.json();
    const validatedData = declareWinnerSchema.parse(body);

    // Get experiment
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    // Validate variant ID
    if (!mongoose.Types.ObjectId.isValid(validatedData.variantId)) {
      return NextResponse.json({ error: "Invalid variant ID" }, { status: 400 });
    }

    const winnerVariantId = new mongoose.Types.ObjectId(validatedData.variantId);

    // Calculate and cache statistical results before declaring winner
    const confidenceThreshold = experiment.stoppingRules?.confidenceThreshold || 95;
    let statisticalResults;
    
    try {
      statisticalResults = await ExperimentAnalyticsService.calculateAndCacheStatisticalResults(
        experimentId,
        undefined,
        confidenceThreshold
      );
    } catch (error) {
      console.error("Error calculating statistical results:", error);
      // Continue with winner declaration even if statistical calculation fails
    }

    // Update experiment with winner
    const updateData: {
      winnerVariantId: mongoose.Types.ObjectId;
      endedReason?: "manual" | "date_reached" | "stopping_rule_met" | "auto_significant";
      status?: "active" | "ended" | "draft" | "paused";
    } = {
      winnerVariantId,
    };

    if (validatedData.endExperiment) {
      updateData.status = "ended";
      // Use "manual" as default endedReason, or validate the provided reason
      updateData.endedReason = (validatedData.reason === "manual" || 
                                 validatedData.reason === "date_reached" || 
                                 validatedData.reason === "stopping_rule_met" || 
                                 validatedData.reason === "auto_significant")
        ? validatedData.reason
        : "manual";
    }

    const updatedExperiment = await ExperimentRepository.update(experimentId, updateData);

    if (!updatedExperiment) {
      return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
    }

    // Create history entry
    await ExperimentHistoryRepository.createHistoryEntry(
      experimentId,
      "winner_declared",
      new mongoose.Types.ObjectId(session.user.id),
      {
        before: experiment.toObject(),
        after: updatedExperiment.toObject(),
        metadata: {
          variantId: validatedData.variantId,
          reason: validatedData.reason,
          endExperiment: validatedData.endExperiment,
          statisticalResults: statisticalResults ? {
            significant: statisticalResults.significant,
            confidence: statisticalResults.confidence,
            lift: statisticalResults.lift,
          } : undefined,
        },
      }
    );

    await log(200);
    return NextResponse.json({
      success: true,
      data: {
        experiment: updatedExperiment,
        statisticalResults,
        message: validatedData.endExperiment
          ? "Winner declared and experiment ended"
          : "Winner declared",
      },
    });
  } catch (error) {
    console.error("Error declaring winner:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to declare winner" }, { status: 500 });
  }
}

/**
 * GET /api/admin/ab-testing/experiments/[id]/winner
 * Get winner determination (automatic calculation)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const guard = await requirePermission("abTesting.view");
    if (guard instanceof NextResponse) return guard;

    const { id: experimentId } = await params;
    const info = await ExperimentAnalyticsService.getExperimentWinnerInfo(experimentId);

    return NextResponse.json({
      success: true,
      data: info,
    });
  } catch (error) {
    console.error("Error determining winner:", error);
    if (error instanceof Error && error.message === "experiment_not_found") {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to determine winner" }, { status: 500 });
  }
}

