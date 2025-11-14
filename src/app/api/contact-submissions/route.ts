import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ContactSubmission from "@/models/ContactSubmission";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Contact Submission API Endpoints
 * Handles CRUD operations for contact form submissions
 */

// Validation schema for creating a contact submission
const createContactSubmissionSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required").max(20),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(2000),
});

// Validation schema for updating contact submission (admin only)
// const updateContactSubmissionSchema = z.object({
//   status: z.enum(['new', 'in_progress', 'resolved', 'closed']).optional(),
//   priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
//   assignedTo: z.string().optional(),
//   adminNotes: z.string().max(1000).optional(),
//   response: z.string().max(2000).optional(),
// });

/**
 * GET /api/contact-submissions
 * Get all contact submissions (admin only)
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
    // For now, we'll allow any authenticated user to view submissions

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const subject = searchParams.get("subject");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const sortBy = searchParams.get("sortBy") || "submittedAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build query
    const query: Record<string, unknown> = {};
    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }
    if (subject) {
      query.subject = subject;
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [submissions, total] = await Promise.all([
      ContactSubmission.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('assignedTo', 'name email')
        .populate('respondedBy', 'name email')
        .lean(),
      ContactSubmission.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        submissions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching contact submissions:", error);
    return NextResponse.json({ error: "Failed to fetch contact submissions" }, { status: 500 });
  }
}

/**
 * POST /api/contact-submissions
 * Create a new contact submission
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = createContactSubmissionSchema.parse(body);

    // Get client IP and user agent for tracking
    const ipAddress = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Create new contact submission
    const contactSubmission = new ContactSubmission({
      ...validatedData,
      ipAddress,
      userAgent,
      submittedAt: new Date(),
    });

    await contactSubmission.save();

    return NextResponse.json({
      success: true,
      message: "Contact form submitted successfully",
      data: {
        id: contactSubmission._id,
        status: contactSubmission.status,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation error", 
        details: error.issues 
      }, { status: 400 });
    }
    console.error("Error creating contact submission:", error);
    return NextResponse.json({ error: "Failed to submit contact form" }, { status: 500 });
  }
}
