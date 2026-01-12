import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PromoBannerTextService } from "@/services/admin/PromoBannerTextService";
import { convertUTCToAEST, createAESTDateAsUTC } from "@/utils/common/timezone";
import { z } from "zod";
import type { PromoBannerText, CreatePromoBannerTextPayload } from "@/types/admin";

// Validation schema
const createBannerTextSchema = z.object({
  text: z.string().min(1).max(100),
  scheduleType: z.enum(["one-time", "recurring"]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  recurrencePattern: z
    .enum(["weekdays", "weekends", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/admin/promo/banner-text
 * Get all scheduled texts (admin management)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new PromoBannerTextService();
    const texts = await service.getAllBannerTexts();

    // Convert dates from UTC to AEST for response
    const response: PromoBannerText[] = texts.map((text) => ({
      id: (text._id as { toString(): string }).toString(),
      text: text.text,
      scheduleType: text.scheduleType,
      startDate: text.startDate ? convertUTCToAEST(text.startDate).toISOString() : undefined,
      endDate: text.endDate ? convertUTCToAEST(text.endDate).toISOString() : undefined,
      recurrencePattern: text.recurrencePattern,
      isActive: text.isActive,
      description: text.description,
      createdAt: text.createdAt.toISOString(),
      updatedAt: text.updatedAt.toISOString(),
      createdBy:
        text.createdBy && typeof text.createdBy === "object" && "firstName" in text.createdBy
          ? {
              id: String((text.createdBy as { _id?: { toString(): string } })._id || ""),
              email: String((text.createdBy as { email?: string }).email || ""),
              firstName: String((text.createdBy as { firstName?: string }).firstName || ""),
              lastName: String((text.createdBy as { lastName?: string }).lastName || ""),
            }
          : null,
    }));

    return NextResponse.json(
      {
        success: true,
        data: response,
        count: response.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching banner texts:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch banner texts",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/promo/banner-text
 * Create new scheduled text
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CreatePromoBannerTextPayload;

    // Validate input
    const validationResult = createBannerTextSchema.safeParse(body);
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

    // Additional validation
    if (data.scheduleType === "one-time") {
      if (!data.startDate || !data.endDate) {
        return NextResponse.json(
          {
            success: false,
            error: "Start date and end date are required for one-time schedules",
          },
          { status: 400 }
        );
      }
    } else if (data.scheduleType === "recurring") {
      if (!data.recurrencePattern) {
        return NextResponse.json(
          {
            success: false,
            error: "Recurrence pattern is required for recurring schedules",
          },
          { status: 400 }
        );
      }
    }

    // Convert dates: Extract date components from ISO string and create as AEST dates
    // Frontend sends ISO strings representing AEST dates, we extract components and recreate as AEST
    const startDateUTC = data.startDate 
      ? (() => {
          const date = new Date(data.startDate);
          const year = date.getUTCFullYear();
          const month = date.getUTCMonth() + 1; // getUTCMonth() returns 0-11
          const day = date.getUTCDate();
          return createAESTDateAsUTC(year, month, day, 0, 0);
        })()
      : undefined;

    const endDateUTC = data.endDate 
      ? (() => {
          const date = new Date(data.endDate);
          const year = date.getUTCFullYear();
          const month = date.getUTCMonth() + 1;
          const day = date.getUTCDate();
          return createAESTDateAsUTC(year, month, day, 0, 0);
        })()
      : undefined;

    const service = new PromoBannerTextService();
    const createdText = await service.createBannerText(
      {
        text: data.text,
        scheduleType: data.scheduleType,
        startDate: startDateUTC,
        endDate: endDateUTC,
        recurrencePattern: data.recurrencePattern,
        description: data.description,
        isActive: data.isActive ?? true,
      },
      session.user.id
    );

    // Convert dates from UTC to AEST for response
    const response: PromoBannerText = {
      id: (createdText._id as { toString(): string }).toString(),
      text: createdText.text,
      scheduleType: createdText.scheduleType,
      startDate: createdText.startDate ? convertUTCToAEST(createdText.startDate).toISOString() : undefined,
      endDate: createdText.endDate ? convertUTCToAEST(createdText.endDate).toISOString() : undefined,
      recurrencePattern: createdText.recurrencePattern,
      isActive: createdText.isActive,
      description: createdText.description,
      createdAt: createdText.createdAt.toISOString(),
      updatedAt: createdText.updatedAt.toISOString(),
      createdBy: {
        id: createdText.createdBy.toString(),
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
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating banner text:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create banner text",
      },
      { status: 500 }
    );
  }
}

