import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import VariantConfigService from "@/services/ab-testing/VariantConfigService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createVariantSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  trafficPercentage: z.number().min(0).max(100),
  config: z.record(z.string(), z.unknown()),
  isControl: z.boolean().default(false),
});

const updateVariantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  trafficPercentage: z.number().min(0).max(100).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isControl: z.boolean().optional(),
});

/**
 * POST /api/admin/ab-testing/experiments/[id]/variants
 * Create variant (validates traffic split)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: experimentId } = await params;
    
    // Check if experiment exists and is not locked
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    if (experiment.isLocked()) {
      return NextResponse.json(
        { error: "Cannot add variants to locked experiment" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = createVariantSchema.parse(body);

    // Validate config
    const configValidation = VariantConfigService.validateVariantConfig(validatedData.config);
    if (!configValidation.valid) {
      return NextResponse.json(
        { error: "Invalid variant config", details: configValidation.errors },
        { status: 400 }
      );
    }

    // Create variant
    const variant = await VariantRepository.create({
      ...validatedData,
      experimentId,
    });

    // Validate traffic split
    const trafficSplit = await VariantRepository.validateTrafficSplit(experimentId);
    if (!trafficSplit.valid) {
      // Still return the variant, but warn about traffic split
      return NextResponse.json({
        success: true,
        data: variant,
        warning: trafficSplit.message,
      });
    }

    return NextResponse.json({
      success: true,
      data: variant,
    });
  } catch (error) {
    console.error("Error creating variant:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to create variant" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/ab-testing/experiments/[id]/variants
 * Update variant (blocks if experiment is active/ended)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: experimentId } = await params;
    const body = await request.json();
    const { variantId, ...updateData } = body;

    if (!variantId) {
      return NextResponse.json({ error: "Variant ID is required" }, { status: 400 });
    }

    // Check if experiment is locked
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    if (experiment.isLocked()) {
      return NextResponse.json(
        { error: "Cannot update variants in locked experiment" },
        { status: 400 }
      );
    }

    const validatedData = updateVariantSchema.parse(updateData);

    // Validate config if provided
    if (validatedData.config) {
      const configValidation = VariantConfigService.validateVariantConfig(validatedData.config);
      if (!configValidation.valid) {
        return NextResponse.json(
          { error: "Invalid variant config", details: configValidation.errors },
          { status: 400 }
        );
      }
    }

    // Update variant
    const variant = await VariantRepository.update(variantId, validatedData);

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    // Validate traffic split
    const trafficSplit = await VariantRepository.validateTrafficSplit(experimentId);
    if (!trafficSplit.valid) {
      return NextResponse.json({
        success: true,
        data: variant,
        warning: trafficSplit.message,
      });
    }

    return NextResponse.json({
      success: true,
      data: variant,
    });
  } catch (error) {
    console.error("Error updating variant:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to update variant" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/ab-testing/experiments/[id]/variants
 * Delete variant (blocks if experiment is active/ended)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: experimentId } = await params;
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");

    if (!variantId) {
      return NextResponse.json({ error: "Variant ID is required" }, { status: 400 });
    }

    // Check if experiment is locked
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    if (experiment.isLocked()) {
      return NextResponse.json(
        { error: "Cannot delete variants from locked experiment" },
        { status: 400 }
      );
    }

    // Check if this is the last variant
    const variants = await VariantRepository.findByExperimentId(experimentId);
    if (variants.length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last variant" },
        { status: 400 }
      );
    }

    // Delete variant
    await VariantRepository.delete(variantId);

    return NextResponse.json({
      success: true,
      message: "Variant deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting variant:", error);
    return NextResponse.json({ error: "Failed to delete variant" }, { status: 500 });
  }
}

