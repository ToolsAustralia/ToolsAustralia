import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import ExperimentEventRepository from "@/repositories/ab-testing/ExperimentEventRepository";
import VariantConfigService from "@/services/ab-testing/VariantConfigService";
import connectDB from "@/lib/mongodb";
import ExperimentEvent from "@/models/ab-testing/ExperimentEvent";
import mongoose from "mongoose";

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
    let body: unknown;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        { error: "Invalid or empty JSON body. Expected { experimentId, slug }." },
        { status: 400 }
      );
    }
    if (body === null || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object with experimentId and slug." },
        { status: 400 }
      );
    }
    const validatedData = assignRequestSchema.parse(body);

    // Get session (if logged in)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const isAdmin = session?.user?.role === "admin";

    // Check for preview mode cookie (admin only)
    const previewCookieName = `ta_ab_preview_${validatedData.experimentId}`;
    const previewVariantId = request.cookies.get(previewCookieName)?.value;

    if (previewVariantId && isAdmin) {
      // Preview mode: Return preview variant without creating assignment
      const previewVariant = await VariantRepository.findById(previewVariantId);
      if (!previewVariant) {
        return NextResponse.json({ error: "Preview variant not found" }, { status: 404 });
      }

      // Merge config with defaults
      const defaultConfig = VariantConfigService.getDefaultConfig();
      const mergedConfig = VariantConfigService.mergeVariantConfig(defaultConfig, previewVariant.config);

      // Track preview page view event (marked as preview)
      try {
        await connectDB();
        const anonymousId = AnonymousIdService.extractAnonymousId(request) || await AnonymousIdService.getOrCreateAnonymousId(request);
        
        // ✅ DEDUPLICATION: Check for recent page view (within 1 minute)
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        
        const query: Record<string, unknown> = {
          experimentId: new mongoose.Types.ObjectId(validatedData.experimentId),
          variantId: new mongoose.Types.ObjectId(previewVariantId),
          eventType: "page_view",
          timestamp: { $gte: oneMinuteAgo },
        };

        // Check by userId if logged in, otherwise by anonymousId
        if (userId) {
          query.userId = new mongoose.Types.ObjectId(userId);
        } else {
          query.anonymousId = anonymousId;
          query.userId = { $exists: false };
        }

        const existingPageView = await ExperimentEvent.findOne(query).lean();

        // Only track if no recent page view exists
        if (!existingPageView) {
          await ExperimentEventRepository.createEvent({
            experimentId: validatedData.experimentId,
            variantId: previewVariantId,
            eventType: "page_view",
            userId,
            anonymousId,
            metadata: {
              slug: validatedData.slug,
              isPreview: true,
            },
          });
        }
      } catch (error) {
        // Don't fail the request if event tracking fails
        console.error("Failed to track preview page view event:", error);
      }

      return NextResponse.json({
        variantId: previewVariantId,
        variantConfig: mergedConfig,
        anonymousId: AnonymousIdService.extractAnonymousId(request) || null,
        isPreview: true,
      });
    }

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
      // Still set anonymous ID cookie if it's new
      const response = NextResponse.json(
        {
          variantId: null,
          variantConfig: null,
          anonymousId: null,
          isAdmin: !!userId,
        },
        { status: 200 }
      );

      // Always set anonymous ID cookie to ensure persistence
      const cookieSettings = AnonymousIdService.getCookieSettings();
      response.cookies.set(cookieSettings.name, anonymousId, {
        httpOnly: cookieSettings.httpOnly,
        sameSite: cookieSettings.sameSite,
        secure: cookieSettings.secure,
        maxAge: cookieSettings.maxAge,
        path: cookieSettings.path,
      });

      return response;
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
    // ✅ DEDUPLICATION: Prevent duplicate page views within 1 minute
    try {
      await connectDB();
      
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      
      const query: Record<string, unknown> = {
        experimentId: new mongoose.Types.ObjectId(validatedData.experimentId),
        variantId: new mongoose.Types.ObjectId(assignment.variantId),
        eventType: "page_view",
        timestamp: { $gte: oneMinuteAgo },
      };

      // Check by userId if logged in, otherwise by anonymousId
      if (userId) {
        query.userId = new mongoose.Types.ObjectId(userId);
      } else {
        query.anonymousId = anonymousId;
        query.userId = { $exists: false };
      }

      const existingPageView = await ExperimentEvent.findOne(query).lean();

      // Only track if no recent page view exists
      if (!existingPageView) {
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
      }
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

    // Always set anonymous ID cookie to ensure persistence and refresh expiration
    const cookieSettings = AnonymousIdService.getCookieSettings();
    response.cookies.set(cookieSettings.name, anonymousId, {
      httpOnly: cookieSettings.httpOnly,
      sameSite: cookieSettings.sameSite,
      secure: cookieSettings.secure,
      maxAge: cookieSettings.maxAge,
      path: cookieSettings.path,
    });

    // ✅ Store assignment in cookie as backup for payment tracking
    // This ensures we can find the assignment even if database lookup fails
    const assignmentCookieName = `ta_ab_assignment_${validatedData.experimentId}`;
    const assignmentData = JSON.stringify({
      experimentId: validatedData.experimentId,
      variantId: assignment.variantId,
      assignedAt: new Date().toISOString(),
    });
    response.cookies.set(assignmentCookieName, assignmentData, {
      httpOnly: false, // Need to read it client-side for payment creation
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
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

