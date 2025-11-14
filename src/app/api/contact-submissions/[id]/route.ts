import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ContactSubmission from "@/models/ContactSubmission";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

/**
 * Contact Submission Individual API Endpoints
 * Handles operations on specific contact submissions
 */

// Validation schema for updating contact submission
const updateContactSubmissionSchema = z.object({
  status: z.enum(['new', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
  adminNotes: z.string().max(1000).optional(),
  response: z.string().max(2000).optional(),
});

// Validation schema for params
const paramsSchema = z.object({
  id: z.string().min(1, "Submission ID is required"),
});

/**
 * GET /api/contact-submissions/[id]
 * Get a specific contact submission (admin only)
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
    // For now, we'll allow any authenticated user to view submissions

    const { id } = paramsSchema.parse(await params);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
    }

    const submission = await ContactSubmission.findById(id)
      .populate('assignedTo', 'name email')
      .populate('respondedBy', 'name email')
      .lean();

    if (!submission) {
      return NextResponse.json({ error: "Contact submission not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error fetching contact submission:", error);
    return NextResponse.json({ error: "Failed to fetch contact submission" }, { status: 500 });
  }
}

/**
 * PUT /api/contact-submissions/[id]
 * Update a specific contact submission (admin only)
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
    // For now, we'll allow any authenticated user to update submissions

    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const validatedData = updateContactSubmissionSchema.parse(body);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
    }

    const submission = await ContactSubmission.findById(id);
    if (!submission) {
      return NextResponse.json({ error: "Contact submission not found" }, { status: 404 });
    }

    // Update submission
    const updateData: Record<string, unknown> = { ...validatedData };
    
    // If response is being added, update response information
    if (validatedData.response && validatedData.response !== submission.response) {
      updateData.respondedBy = session.user.id;
      updateData.respondedAt = new Date();
    }

    // Convert assignedTo string to ObjectId if provided
    if (validatedData.assignedTo && mongoose.Types.ObjectId.isValid(validatedData.assignedTo)) {
      updateData.assignedTo = new mongoose.Types.ObjectId(validatedData.assignedTo);
    }

    const updatedSubmission = await ContactSubmission.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'name email')
     .populate('respondedBy', 'name email');

    return NextResponse.json({
      success: true,
      message: "Contact submission updated successfully",
      data: updatedSubmission,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error updating contact submission:", error);
    return NextResponse.json({ error: "Failed to update contact submission" }, { status: 500 });
  }
}

/**
 * DELETE /api/contact-submissions/[id]
 * Delete a specific contact submission (admin only)
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
    // For now, we'll allow any authenticated user to delete submissions

    const { id } = paramsSchema.parse(await params);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
    }

    const submission = await ContactSubmission.findByIdAndDelete(id);
    if (!submission) {
      return NextResponse.json({ error: "Contact submission not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Contact submission deleted successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting contact submission:", error);
    return NextResponse.json({ error: "Failed to delete contact submission" }, { status: 500 });
  }
}
