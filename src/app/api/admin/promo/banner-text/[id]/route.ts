import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PromoBannerTextService } from "@/services/admin/PromoBannerTextService";
import { convertUTCToAEST } from "@/utils/common/timezone";
import { z } from "zod";
import mongoose from "mongoose";
import type { PromoBannerText, UpdatePromoBannerTextPayload } from "@/types/admin";

// Validation schema
const updateBannerTextSchema = z.object({
  imageUrl: z.string().min(1).max(2048).optional(),
  altText: z.string().max(200).optional(),
  scheduleType: z.enum(["one-time", "recurring"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  recurrencePattern: z
    .enum(["weekdays", "weekends", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/promo/banner-text/[id]
 * Update scheduled text
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid banner text ID",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdatePromoBannerTextPayload;

    // Validate input
    const validationResult = updateBannerTextSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Frontend now sends ISO strings representing AEST dates (already converted)
    // We can use them directly as they represent AEST dates converted to UTC
    const startDateUTC = data.startDate ? new Date(data.startDate) : undefined;
    const endDateUTC = data.endDate ? new Date(data.endDate) : undefined;

    const service = new PromoBannerTextService();
    const updatedText = await service.updateBannerText(id, {
      imageUrl: data.imageUrl,
      altText: data.altText,
      scheduleType: data.scheduleType,
      startDate: startDateUTC,
      endDate: endDateUTC,
      recurrencePattern: data.recurrencePattern,
      description: data.description,
      isActive: data.isActive,
    });

    if (!updatedText) {
      return NextResponse.json(
        {
          success: false,
          error: "Banner text not found",
        },
        { status: 404 }
      );
    }

    // Convert dates from UTC to AEST for response
    const response: PromoBannerText = {
      id: (updatedText._id as { toString(): string }).toString(),
      imageUrl: updatedText.imageUrl,
      altText: updatedText.altText,
      scheduleType: updatedText.scheduleType,
      startDate: updatedText.startDate ? convertUTCToAEST(updatedText.startDate).toISOString() : undefined,
      endDate: updatedText.endDate ? convertUTCToAEST(updatedText.endDate).toISOString() : undefined,
      recurrencePattern: updatedText.recurrencePattern,
      isActive: updatedText.isActive,
      description: updatedText.description,
      createdAt: updatedText.createdAt.toISOString(),
      updatedAt: updatedText.updatedAt.toISOString(),
      createdBy: {
        id: updatedText.createdBy.toString(),
        email: "",
        firstName: "",
        lastName: "",
      },
    };

    return NextResponse.json(
      {
        success: true,
        data: response,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating banner text:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update banner text",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/promo/banner-text/[id]
 * Delete scheduled text
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid banner text ID",
        },
        { status: 400 }
      );
    }

    const service = new PromoBannerTextService();
    const deleted = await service.deleteBannerText(id);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: "Banner text not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Banner text deleted successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting banner text:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete banner text",
      },
      { status: 500 }
    );
  }
}

