import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import ExperimentEventRepository from "@/repositories/ab-testing/ExperimentEventRepository";

const trackRequestSchema = z.object({
  experimentId: z.string().min(1, "Experiment ID is required"),
  variantId: z.string().min(1, "Variant ID is required"),
  eventType: z.enum(["page_view", "click", "conversion", "lead", "purchase", "other"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/ab-testing/track
 * Track interaction events (clicks, conversions, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = trackRequestSchema.parse(body);

    // Get session (if logged in)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // Get anonymous ID
    const anonymousId = AnonymousIdService.extractAnonymousId(request) || null;

    // Create event record
    await ExperimentEventRepository.createEvent({
      experimentId: validatedData.experimentId,
      variantId: validatedData.variantId,
      eventType: validatedData.eventType,
      userId,
      anonymousId: anonymousId || undefined,
      metadata: validatedData.metadata,
    });

    return NextResponse.json({
      success: true,
      message: "Event tracked successfully",
    });
  } catch (error) {
    console.error("Error tracking event:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to track event" },
      { status: 500 }
    );
  }
}

