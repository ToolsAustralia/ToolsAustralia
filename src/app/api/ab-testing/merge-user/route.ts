import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";

const mergeRequestSchema = z.object({
  anonymousId: z.string().min(1, "Anonymous ID is required"),
});

/**
 * POST /api/ab-testing/merge-user
 * Merge anonymous assignments to logged-in user (called on user login)
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = mergeRequestSchema.parse(body);

    // Get anonymous ID from request or body
    const anonymousId = validatedData.anonymousId || AnonymousIdService.extractAnonymousId(request);
    
    if (!anonymousId) {
      return NextResponse.json(
        { error: "Anonymous ID not found" },
        { status: 400 }
      );
    }

    // Merge assignments
    const result = await VariantAssignmentService.mergeAnonymousToUser(anonymousId, session.user.id);

    return NextResponse.json({
      success: true,
      merged: result.merged,
      message: `Merged ${result.merged} anonymous assignment(s) to user`,
    });
  } catch (error) {
    console.error("Error merging user assignments:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to merge user assignments" },
      { status: 500 }
    );
  }
}

