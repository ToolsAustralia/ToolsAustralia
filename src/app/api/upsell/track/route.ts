import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const upsellTrackingSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  action: z.enum(["shown", "accepted", "declined", "dismissed"]),
  triggerEvent: z.enum(["membership-purchase", "ticket-purchase", "one-time-purchase"]),
  userType: z.enum(["new-user", "returning-user", "mini-draw-buyer", "special-package-buyer"]),
  timestamp: z.string(),
  userContext: z.object({
    isAuthenticated: z.boolean(),
    hasDefaultPayment: z.boolean(),
    recentPurchase: z.string(),
    totalSpent: z.number(),
  }),
  conversionData: z
    .object({
      purchaseAmount: z.number(),
      entriesAdded: z.number(),
      paymentMethod: z.string(),
    })
    .optional(),
});

/**
 * POST /api/upsell/track
 * Track upsell interactions for analytics
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = upsellTrackingSchema.parse(body);

    console.log(`📊 Tracking upsell event: ${validatedData.action} for offer: ${validatedData.offerId}`);

    // Get user session if available
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // Create analytics record
    const analyticsRecord = {
      offerId: validatedData.offerId,
      action: validatedData.action,
      triggerEvent: validatedData.triggerEvent,
      userType: validatedData.userType,
      userId: userId || null,
      timestamp: new Date(validatedData.timestamp),
      userContext: validatedData.userContext,
      conversionData: validatedData.conversionData,
      sessionId: request.headers.get("x-session-id") || null,
      userAgent: request.headers.get("user-agent") || null,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    };

    // Store analytics data (you can integrate with your analytics service here)
    console.log("Upsell Analytics Record:", analyticsRecord);

    // Update user's upsell interaction history if authenticated
    if (userId) {
      await updateUserUpsellHistory(userId, {
        offerId: validatedData.offerId,
        action: validatedData.action,
        timestamp: new Date(validatedData.timestamp),
        triggerEvent: validatedData.triggerEvent,
        conversionData: validatedData.conversionData,
      });
    }

    // You can also send this data to external analytics services like:
    // - Google Analytics
    // - Mixpanel
    // - Amplitude
    // - Your custom analytics database

    return NextResponse.json({
      success: true,
      message: "Analytics tracked successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Upsell tracking error:", error);
    return NextResponse.json({ error: "Failed to track analytics" }, { status: 500 });
  }
}

/**
 * Update user's upsell interaction history
 */
async function updateUserUpsellHistory(
  userId: string,
  trackingData: {
    offerId: string;
    action: string;
    timestamp: Date;
    triggerEvent?: string;
    conversionData?: {
      purchaseAmount?: number;
      entriesAdded?: number;
      paymentMethod?: string;
    };
  }
) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Initialize upsell history if it doesn't exist
    if (!user.upsellHistory) {
      user.upsellHistory = [];
    }

    // Add new interaction
    user.upsellHistory.push({
      offerId: trackingData.offerId,
      action: trackingData.action,
      triggerEvent: trackingData.triggerEvent || "unknown",
      timestamp: new Date(trackingData.timestamp),
    });

    // Update upsell statistics
    if (!user.upsellStats) {
      user.upsellStats = {
        totalShown: 0,
        totalAccepted: 0,
        totalDeclined: 0,
        totalDismissed: 0,
        conversionRate: 0,
        lastInteraction: null,
      };
    }

    // Update stats based on action
    switch (trackingData.action) {
      case "shown":
        user.upsellStats.totalShown += 1;
        break;
      case "accepted":
        user.upsellStats.totalAccepted += 1;
        break;
      case "declined":
        user.upsellStats.totalDeclined += 1;
        break;
      case "dismissed":
        user.upsellStats.totalDismissed += 1;
        break;
    }

    // Calculate conversion rate
    if (user.upsellStats.totalShown > 0) {
      user.upsellStats.conversionRate = (user.upsellStats.totalAccepted / user.upsellStats.totalShown) * 100;
    }

    user.upsellStats.lastInteraction = new Date(trackingData.timestamp);

    await user.save();

    console.log(`✅ Updated upsell history for user: ${user.email}`);
  } catch (error) {
    console.error("Error updating user upsell history:", error);
  }
}

/**
 * GET /api/upsell/track
 * Get upsell analytics data (for admin dashboard)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const offerId = searchParams.get("offerId");
    const action = searchParams.get("action");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Build query
    const query: Record<string, unknown> = {};
    if (offerId) query.offerId = offerId;
    if (action) query.action = action;
    if (startDate || endDate) {
      query.timestamp = {} as Record<string, Date>;
      if (startDate) (query.timestamp as Record<string, Date>).$gte = new Date(startDate);
      if (endDate) (query.timestamp as Record<string, Date>).$lte = new Date(endDate);
    }

    // For now, return mock data since we're not storing in a separate analytics collection
    // In production, you'd query your analytics database here
    const mockAnalytics = {
      totalEvents: 0,
      conversionRate: 0,
      topOffers: [],
      userSegments: {},
      timeRange: {
        startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: endDate || new Date().toISOString(),
      },
    };

    return NextResponse.json({
      success: true,
      data: mockAnalytics,
    });
  } catch (error) {
    console.error("Get upsell analytics error:", error);
    return NextResponse.json({ error: "Failed to get analytics data" }, { status: 500 });
  }
}
