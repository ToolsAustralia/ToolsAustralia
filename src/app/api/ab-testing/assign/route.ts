import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import ExperimentEventRepository from "@/repositories/ab-testing/ExperimentEventRepository";
import VariantConfigService from "@/services/ab-testing/VariantConfigService";

const assignRequestSchema = z.object({
  experimentId: z.string().min(1, "Experiment ID is required"),
  slug: z.string().min(1, "Slug is required"),
});

/**
 * POST /api/ab-testing/assign
 * Assign variant for current user (server-side, sets cookie)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = assignRequestSchema.parse(body);

    // Get session (if logged in)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // Get or create anonymous ID
    const anonymousId = await AnonymousIdService.getOrCreateAnonymousId(request);

    // Assign variant
    const assignment = await VariantAssignmentService.assignVariant(
      validatedData.experimentId,
      userId,
      anonymousId
    );

    if (!assignment) {
      // Admin user or no assignment possible
      return NextResponse.json(
        {
          variantId: null,
          variantConfig: null,
          anonymousId: null,
          isAdmin: !!userId,
        },
        { status: 200 }
      );
    }

    // Get variant config
    const variant = await VariantRepository.findById(assignment.variantId);
    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    // Merge config with defaults
    const defaultConfig = VariantConfigService.getDefaultConfig();
    const mergedConfig = VariantConfigService.mergeVariantConfig(defaultConfig, variant.config);

    // Track page view event
    try {
      await ExperimentEventRepository.createEvent({
        experimentId: validatedData.experimentId,
        variantId: assignment.variantId,
        eventType: "page_view",
        userId,
        anonymousId,
        metadata: {
          slug: validatedData.slug,
        },
      });
    } catch (error) {
      // Don't fail the request if event tracking fails
      console.error("Failed to track page view event:", error);
    }

    // Create response with cookie
    const response = NextResponse.json({
      variantId: assignment.variantId,
      variantConfig: mergedConfig,
      anonymousId,
    });

    // Set anonymous ID cookie if it's new
    const cookieSettings = AnonymousIdService.getCookieSettings();
    response.cookies.set(cookieSettings.name, anonymousId, {
      httpOnly: cookieSettings.httpOnly,
      sameSite: cookieSettings.sameSite,
      secure: cookieSettings.secure,
      maxAge: cookieSettings.maxAge,
      path: cookieSettings.path,
    });

    return response;
  } catch (error) {
    console.error("Error assigning variant:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to assign variant" },
      { status: 500 }
    );
  }
}

