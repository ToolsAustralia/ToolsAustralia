import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import ExperimentService from "@/services/ab-testing/ExperimentService";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateExperimentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
  slugTargets: z.array(z.string()).min(1).optional(),
  startDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
});

/**
 * GET /api/admin/ab-testing/experiments/[id]
 * Get experiment details with variants
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const guard = await requirePermission("abTesting.view");
    if (guard instanceof NextResponse) return guard;

    const { id } = await params;
    const experiment = await ExperimentRepository.findById(id);

    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    // Get variants
    const variants = await VariantRepository.findByExperimentId(id);

    return NextResponse.json({
      success: true,
      data: {
        experiment,
        variants,
      },
    });
  } catch (error) {
    console.error("Error fetching experiment:", error);
    return NextResponse.json({ error: "Failed to fetch experiment" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/ab-testing/experiments/[id]
 * Update experiment (blocks edits to active/ended experiments)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  let experimentId: string | undefined;

  try {
    const guard = await requirePermission("abTesting.edit");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    const { id } = await params;
    experimentId = id; // ✅ Store id outside try block for error handling
    const body = await request.json();
    
    await connectDB();

    // ✅ Check current status before attempting to change it
    const currentExperiment = await ExperimentRepository.findById(id);
    if (!currentExperiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    // Handle status changes (activate, pause, end)
    if (body.status === "active") {
      // ✅ If already active, return success (idempotent)
      if (currentExperiment.status === "active") {
        return NextResponse.json({
          success: true,
          data: currentExperiment,
          message: "Experiment is already active",
        });
      }
      await ExperimentService.activateExperiment(id, new mongoose.Types.ObjectId(session.user.id));
    } else if (body.status === "paused") {
      // ✅ If already paused, return success (idempotent)
      if (currentExperiment.status === "paused") {
        return NextResponse.json({
          success: true,
          data: currentExperiment,
          message: "Experiment is already paused",
        });
      }
      await ExperimentService.pauseExperiment(id, new mongoose.Types.ObjectId(session.user.id));
    } else if (body.status === "ended") {
      // ✅ If already ended, return success (idempotent)
      if (currentExperiment.status === "ended") {
        return NextResponse.json({
          success: true,
          data: currentExperiment,
          message: "Experiment is already ended",
        });
      }
      await ExperimentService.endExperiment(id, new mongoose.Types.ObjectId(session.user.id));
    } else {
      // Regular update
      const validatedData = updateExperimentSchema.parse(body);

      // Check if experiment can be edited
      const canEdit = await ExperimentService.canEditExperiment(id);
      if (!canEdit) {
        return NextResponse.json(
          { error: "Cannot edit locked experiment (active or ended)" },
          { status: 400 }
        );
      }

      // Validate dates if provided
      if (validatedData.startDate || validatedData.endDate) {
        const experiment = await ExperimentRepository.findById(id);
        const startDate = validatedData.startDate || experiment?.startDate;
        const endDate = validatedData.endDate || experiment?.endDate;
        
        const dateValidation = ExperimentService.validateExperimentDates(startDate, endDate);
        if (!dateValidation.valid) {
          return NextResponse.json(
            { error: dateValidation.message || "Invalid date range" },
            { status: 400 }
          );
        }
      }

      // Update experiment
      await ExperimentService.updateExperiment(
        id,
        validatedData,
        new mongoose.Types.ObjectId(session.user.id)
      );
    }

    const updatedExperiment = await ExperimentRepository.findById(id);

    return NextResponse.json({
      success: true,
      data: updatedExperiment,
    });
  } catch (error) {
    console.error("Error updating experiment:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    // ✅ Return actual error message for better debugging
    const errorMessage = error instanceof Error ? error.message : "Failed to update experiment";
    console.error("Experiment update error details:", {
      experimentId: experimentId || "unknown",
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json({ 
      error: errorMessage,
      details: error instanceof Error ? error.stack : undefined 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/ab-testing/experiments/[id]
 * Soft delete experiment (only if draft/paused)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const guard = await requirePermission("abTesting.edit");
    if (guard instanceof NextResponse) return guard;

    const { id } = await params;
    const experiment = await ExperimentRepository.findById(id);

    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    // Only allow deletion of draft or paused experiments
    if (experiment.status === "active" || experiment.status === "ended") {
      return NextResponse.json(
        { error: "Cannot delete active or ended experiments" },
        { status: 400 }
      );
    }

    // Soft delete (set status to ended)
    await ExperimentRepository.delete(id);

    return NextResponse.json({
      success: true,
      message: "Experiment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting experiment:", error);
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }
}

