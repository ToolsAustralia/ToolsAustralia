import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PartnerApplication from "@/models/PartnerApplication";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

/**
 * Partner Application Individual API Endpoints
 * Handles operations on specific partner applications
 */

// Validation schema for updating partner application
const updatePartnerApplicationSchema = z.object({
  status: z.enum(["pending", "under_review", "approved", "rejected", "contacted"]).optional(),
  adminNotes: z.string().max(1000).optional(),
});

// Validation schema for params
const paramsSchema = z.object({
  id: z.string().min(1, "Application ID is required"),
});

/**
 * GET /api/partner-applications/[id]
 * Get a specific partner application (admin only)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Check if user is authenticated and has admin role
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin role check here
    // For now, we'll allow any authenticated user to view applications

    const { id } = paramsSchema.parse(await params);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
    }

    const application = await PartnerApplication.findById(id).populate("reviewedBy", "name email").lean();

    if (!application) {
      return NextResponse.json({ error: "Partner application not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: application,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error fetching partner application:", error);
    return NextResponse.json({ error: "Failed to fetch partner application" }, { status: 500 });
  }
}

/**
 * PUT /api/partner-applications/[id]
 * Update a specific partner application (admin only)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Check if user is authenticated and has admin role
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin role check here
    // For now, we'll allow any authenticated user to update applications

    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const validatedData = updatePartnerApplicationSchema.parse(body);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
    }

    const application = await PartnerApplication.findById(id);
    if (!application) {
      return NextResponse.json({ error: "Partner application not found" }, { status: 404 });
    }

    // Update application
    const updateData: Record<string, unknown> = { ...validatedData };

    // If status is being changed, update review information
    if (validatedData.status && validatedData.status !== application.status) {
      updateData.reviewedBy = session.user.id;
      updateData.reviewedAt = new Date();
    }

    const updatedApplication = await PartnerApplication.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("reviewedBy", "name email");

    return NextResponse.json({
      success: true,
      message: "Partner application updated successfully",
      data: updatedApplication,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error updating partner application:", error);
    return NextResponse.json({ error: "Failed to update partner application" }, { status: 500 });
  }
}

/**
 * DELETE /api/partner-applications/[id]
 * Delete a specific partner application (admin only)
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Check if user is authenticated and has admin role
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin role check here
    // For now, we'll allow any authenticated user to delete applications

    const { id } = paramsSchema.parse(await params);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
    }

    const application = await PartnerApplication.findByIdAndDelete(id);
    if (!application) {
      return NextResponse.json({ error: "Partner application not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Partner application deleted successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting partner application:", error);
    return NextResponse.json({ error: "Failed to delete partner application" }, { status: 500 });
  }
}
