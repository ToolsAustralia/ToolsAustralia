import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import ExperimentService from "@/services/ab-testing/ExperimentService";
import ExperimentHistoryRepository from "@/repositories/ab-testing/ExperimentHistoryRepository";
import mongoose from "mongoose";

const stoppingRulesSchema = z.object({
  minConversions: z.number().min(0).optional(),
  confidenceThreshold: z.number().min(0).max(100).optional(),
  maxDuration: z.number().min(1).optional(),
  autoEndEnabled: z.boolean().optional(),
}).optional();

const createExperimentSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name cannot exceed 200 characters"),
  status: z.enum(["draft", "active", "paused", "ended"]).default("draft"),
  slugTargets: z.array(z.string()).min(1, "At least one slug target is required"),
  startDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  stoppingRules: stoppingRulesSchema,
});

/**
 * GET /api/admin/ab-testing/experiments
 * List all experiments with pagination, filtering, sorting
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("abTesting.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const result = await ExperimentService.listExperiments({
      status: searchParams.get("status") || undefined,
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "25", 10),
      sortBy: searchParams.get("sortBy") || "createdAt",
      sortOrder: (searchParams.get("sortOrder") || "desc") as "asc" | "desc",
    });

    return NextResponse.json({
      success: true,
      data: result.experiments,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching experiments:", error);
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }
}

/**
 * POST /api/admin/ab-testing/experiments
 * Create new experiment
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission("abTesting.edit");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    const body = await request.json();
    const validatedData = createExperimentSchema.parse(body);

    // Validate dates
    const dateValidation = ExperimentService.validateExperimentDates(validatedData.startDate, validatedData.endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.message || "Invalid date range" },
        { status: 400 }
      );
    }

    // Create experiment
    const experiment = await ExperimentRepository.create({
      ...validatedData,
      createdBy: new mongoose.Types.ObjectId(session.user.id),
    });

    // Create history entry
    const experimentId = experiment._id instanceof mongoose.Types.ObjectId 
      ? experiment._id.toString() 
      : String(experiment._id);
    await ExperimentHistoryRepository.createHistoryEntry(
      experimentId,
      "created",
      new mongoose.Types.ObjectId(session.user.id),
      {
        after: experiment.toObject(),
      }
    );

    return NextResponse.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    console.error("Error creating experiment:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }
}

