import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ContactSubmission from "@/models/ContactSubmission";
import { z } from "zod";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { emailService } from "@/lib/email/";
import mongoose from "mongoose";

const replySchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(15000),
});

const paramsSchema = z.object({
  id: z.string().min(1, "Submission ID is required"),
});

/**
 * POST /api/contact-submissions/[id]/reply
 * Send an admin reply to a contact submission and store it in the thread.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const guard = await requirePermissionWithAudit("submissions.edit", request, {
      resourceType: "ContactSubmission",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
    }

    const body = await request.json();
    const { subject, message } = replySchema.parse(body);

    const submission = await ContactSubmission.findById(id);
    if (!submission) {
      return NextResponse.json({ error: "Contact submission not found" }, { status: 404 });
    }

    const emailResult = await emailService.sendAdminReplyEmail(submission.email, {
      submitterName: submission.firstName,
      adminMessage: message,
      originalSubject: subject,
      submissionType: "contact",
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

    await ContactSubmission.findByIdAndUpdate(
      id,
      {
        $push: { replies: reply },
        $set: {
          respondedBy: session.user.id,
          respondedAt: new Date(),
        },
      },
      { runValidators: true }
    );

    const updatedSubmission = await ContactSubmission.findById(id)
      .populate("assignedTo", "name email")
      .populate("respondedBy", "name email")
      .populate({ path: "replies.sentBy", select: "name email", strictPopulate: false })
      .lean();

    await log(200);
    return NextResponse.json({
      success: true,
      message: "Reply sent successfully",
      data: updatedSubmission,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error sending contact submission reply:", error);
    return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
  }
}
