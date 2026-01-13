import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const previewRequestSchema = z.object({
  experimentId: z.string().min(1, "Experiment ID is required"),
  variantId: z.string().min(1, "Variant ID is required"),
});

/**
 * POST /api/admin/ab-testing/preview
 * Preview specific variant (admin only, doesn't affect analytics)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = previewRequestSchema.parse(body);

    // Set preview cookie
    const cookieName = `ta_ab_preview_${validatedData.experimentId}`;
    const response = NextResponse.json({
      success: true,
      message: "Preview mode activated",
    });

    // Set cookie: HttpOnly, 1 hour expiry
    response.cookies.set(cookieName, validatedData.variantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error setting preview:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to set preview" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/ab-testing/preview
 * Clear preview cookie
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const experimentId = searchParams.get("experimentId");

    if (!experimentId) {
      return NextResponse.json({ error: "Experiment ID is required" }, { status: 400 });
    }

    const cookieName = `ta_ab_preview_${experimentId}`;
    const response = NextResponse.json({
      success: true,
      message: "Preview mode cleared",
    });

    // Clear cookie
    response.cookies.delete(cookieName);

    return response;
  } catch (error) {
    console.error("Error clearing preview:", error);
    return NextResponse.json({ error: "Failed to clear preview" }, { status: 500 });
  }
}

