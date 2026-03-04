import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PartnerApplication from "@/models/PartnerApplication";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emailService } from "@/lib/email/";
import mongoose from "mongoose";

const replySchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(15000),
});

const paramsSchema = z.object({
  id: z.string().min(1, "Application ID is required"),
});

/**
 * POST /api/partner-applications/[id]/reply
 * Send an admin reply to a partner application and store it in the thread.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = paramsSchema.parse(await params);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
    }

    const body = await request.json();
    const { subject, message } = replySchema.parse(body);

    const application = await PartnerApplication.findById(id);
    if (!application) {
      return NextResponse.json({ error: "Partner application not found" }, { status: 404 });
    }

    const emailResult = await emailService.sendAdminReplyEmail(application.email, {
      submitterName: application.firstName,
      adminMessage: message,
      originalSubject: subject,
      submissionType: "partner",
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: "Failed to send reply email" },
        { status: 500 }
      );
    }

    const reply = {
      body: message,
      sentAt: new Date(),
      sentBy: new mongoose.Types.ObjectId(session.user.id),
    };

    await PartnerApplication.findByIdAndUpdate(
      id,
      {
        $push: { replies: reply },
        $set: {
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        },
      },
      { runValidators: true }
    );

    const updatedApplication = await PartnerApplication.findById(id)
      .populate("reviewedBy", "name email")
      .populate({ path: "replies.sentBy", select: "name email", strictPopulate: false })
      .lean();

    return NextResponse.json({
      success: true,
      message: "Reply sent successfully",
      data: updatedApplication,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error sending partner application reply:", error);
    return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
  }
}
