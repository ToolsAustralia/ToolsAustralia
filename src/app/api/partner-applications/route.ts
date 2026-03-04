import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PartnerApplication from "@/models/PartnerApplication";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emailService, checkFormSubmissionRateLimit } from "@/lib/email/";

/**
 * Partner Application API Endpoints
 * Handles CRUD operations for partner applications
 */

// Validation schema for creating a partner application
const createPartnerApplicationSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  businessName: z.string().min(1, "Business name is required").max(200),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required").max(20),
  abn: z.string().optional().refine((val) => !val || /^\d{11}$/.test(val.replace(/\s/g, "")), {
    message: "ABN must be 11 digits"
  }),
  acn: z.string().optional().refine((val) => !val || /^\d{9}$/.test(val.replace(/\s/g, "")), {
    message: "ACN must be 9 digits"
  }),
  goals: z.string().max(1000).optional(),
});

// Validation schema for updating partner application status (admin only)
// const updatePartnerApplicationSchema = z.object({
//   status: z.enum(['pending', 'under_review', 'approved', 'rejected', 'contacted']).optional(),
//   adminNotes: z.string().max(1000).optional(),
// });

/**
 * GET /api/partner-applications
 * Get all partner applications (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Check if user is authenticated and has admin role
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin role check here
    // For now, we'll allow any authenticated user to view applications
    // In production, you should check if user.role === 'admin'

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const readFilter = searchParams.get("readFilter");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const sortBy = searchParams.get("sortBy") || "submittedAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build query
    const query: Record<string, unknown> = {};
    if (status) {
      query.status = status;
    }
    if (readFilter === "unread") {
      query.$or = [{ readAt: null }, { readAt: { $exists: false } }];
    } else if (readFilter === "read") {
      query.readAt = { $exists: true, $ne: null };
    }
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$and = query.$and || [];
      (query.$and as object[]).push({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { businessName: searchRegex },
        ],
      });
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [applications, total] = await Promise.all([
      PartnerApplication.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('reviewedBy', 'name email')
        .lean(),
      PartnerApplication.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        applications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching partner applications:", error);
    return NextResponse.json({ error: "Failed to fetch partner applications" }, { status: 500 });
  }
}

/**
 * POST /api/partner-applications
 * Create a new partner application
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = createPartnerApplicationSchema.parse(body);

    // Get client IP and user agent for tracking
    const ipAddress = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Check rate limiting BEFORE saving to database (use email + IP for better spam prevention)
    const rateLimitIdentifier = `${validatedData.email}_${ipAddress}`;
    const rateLimitCheck = checkFormSubmissionRateLimit(rateLimitIdentifier);
    
    if (!rateLimitCheck.allowed) {
      console.warn(`Rate limit exceeded for partner application from ${validatedData.email} (IP: ${ipAddress}). Retry after ${rateLimitCheck.retryAfter} seconds.`);
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded",
          message: `Please wait ${rateLimitCheck.retryAfter} seconds before submitting again.`,
          retryAfter: rateLimitCheck.retryAfter,
        },
        { status: 429 } // 429 Too Many Requests
      );
    }

    // Create new partner application
    const partnerApplication = new PartnerApplication({
      ...validatedData,
      ipAddress,
      userAgent,
      submittedAt: new Date(),
    });

    await partnerApplication.save();

    const emailResult = await emailService.sendPartnerApplicationEmail({
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      businessName: validatedData.businessName,
      email: validatedData.email,
      phone: validatedData.phone,
      abn: validatedData.abn,
      acn: validatedData.acn,
      goals: validatedData.goals,
      submittedAt: partnerApplication.submittedAt.toISOString(),
    });

    if (!emailResult.success) {
      console.error("Failed to send partner application email notification:", emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: "We received your application but encountered an issue notifying our team. Your application has been saved. Please try again in a few minutes or contact us directly.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Partner application submitted successfully",
      data: {
        id: partnerApplication._id,
        status: partnerApplication.status,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation error", 
        details: error.issues 
      }, { status: 400 });
    }
    console.error("Error creating partner application:", error);
    return NextResponse.json({ error: "Failed to submit partner application" }, { status: 500 });
  }
}
