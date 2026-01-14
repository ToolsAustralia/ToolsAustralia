import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import ExperimentEventRepository from "@/repositories/ab-testing/ExperimentEventRepository";
import connectDB from "@/lib/mongodb";
import ExperimentEvent from "@/models/ab-testing/ExperimentEvent";
import mongoose from "mongoose";

const trackRequestSchema = z.object({
  experimentId: z.string().min(1, "Experiment ID is required"),
  variantId: z.string().min(1, "Variant ID is required"),
  eventType: z.enum(["page_view", "click", "conversion", "lead", "purchase", "other"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/ab-testing/track
 * Track interaction events (clicks, conversions, etc.)
 * 
 * ✅ DEDUPLICATION:
 * - Page views: Prevent duplicate within 1 minute (handles refresh)
 * - Clicks: Prevent duplicate within 5 seconds (handles double-click)
 * - Purchases/Conversions: Prevent duplicate by orderId (database unique index)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = trackRequestSchema.parse(body);

    await connectDB();

    // Get session (if logged in)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // Get anonymous ID
    const anonymousId = AnonymousIdService.extractAnonymousId(request) || null;

    // ✅ DEDUPLICATION LOGIC
    const now = new Date();
    const experimentIdObj = new mongoose.Types.ObjectId(validatedData.experimentId);
    const variantIdObj = new mongoose.Types.ObjectId(validatedData.variantId);

    // For purchases/conversions: Check if orderId already exists
    if ((validatedData.eventType === "purchase" || validatedData.eventType === "conversion") && validatedData.metadata?.orderId) {
      const existingPurchase = await ExperimentEvent.findOne({
        experimentId: experimentIdObj,
        variantId: variantIdObj,
        eventType: validatedData.eventType,
        "metadata.orderId": validatedData.metadata.orderId,
      }).lean();

      if (existingPurchase) {
        // Duplicate purchase/conversion detected - return success (idempotent)
        return NextResponse.json({
          success: true,
          message: "Event already tracked (duplicate prevented)",
          duplicate: true,
        });
      }
    }

    // For page views: Prevent duplicate within 1 minute
    if (validatedData.eventType === "page_view") {
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      
      const query: Record<string, unknown> = {
        experimentId: experimentIdObj,
        variantId: variantIdObj,
        eventType: "page_view",
        timestamp: { $gte: oneMinuteAgo },
      };

      // Check by userId if logged in, otherwise by anonymousId
      if (userId) {
        query.userId = new mongoose.Types.ObjectId(userId);
      } else if (anonymousId) {
        query.anonymousId = anonymousId;
        query.userId = { $exists: false };
      }

      const recentPageView = await ExperimentEvent.findOne(query).lean();

      if (recentPageView) {
        // Duplicate page view detected - return success (idempotent)
        return NextResponse.json({
          success: true,
          message: "Page view already tracked (duplicate prevented)",
          duplicate: true,
        });
      }
    }

    // For clicks: Prevent duplicate within 5 seconds
    if (validatedData.eventType === "click") {
      const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
      
      const query: Record<string, unknown> = {
        experimentId: experimentIdObj,
        variantId: variantIdObj,
        eventType: "click",
        timestamp: { $gte: fiveSecondsAgo },
      };

      // Check by userId if logged in, otherwise by anonymousId
      if (userId) {
        query.userId = new mongoose.Types.ObjectId(userId);
      } else if (anonymousId) {
        query.anonymousId = anonymousId;
        query.userId = { $exists: false };
      }

      // Also check metadata.element if provided (for same element clicks)
      if (validatedData.metadata?.element) {
        query["metadata.element"] = validatedData.metadata.element;
      }

      const recentClick = await ExperimentEvent.findOne(query).lean();

      if (recentClick) {
        // Duplicate click detected - return success (idempotent)
        return NextResponse.json({
          success: true,
          message: "Click already tracked (duplicate prevented)",
          duplicate: true,
        });
      }
    }

    // Create event record (deduplication checks passed)
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
    
    // Handle MongoDB duplicate key error (for purchase/conversion unique index)
    if (error instanceof Error && error.message.includes("E11000")) {
      // Duplicate key error - event already exists
      return NextResponse.json({
        success: true,
        message: "Event already tracked (duplicate prevented)",
        duplicate: true,
      });
    }
    
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

