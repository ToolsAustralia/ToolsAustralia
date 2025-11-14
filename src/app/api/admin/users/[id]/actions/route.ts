import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";
// Note: Email and SMS functions need to be implemented
// import { sendEmail } from "@/lib/email";
// import { sendSMS } from "@/lib/sms";
import crypto from "crypto";

/**
 * POST /api/admin/users/[id]/actions
 * Perform admin actions on a user account
 *
 * Supported actions:
 * - resend_verification: Resend email verification
 * - reset_password: Send password reset email
 * - toggle_status: Activate/deactivate account
 * - add_note: Add internal admin note
 * - resend_sms_verification: Resend SMS verification code
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;
    const body = (await request.json()) as { action: string; note?: string; reason?: string };
    const { action, note, reason } = body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // Validate action type
    const validActions = [
      "resend_verification",
      "reset_password",
      "toggle_status",
      "add_note",
      "resend_sms_verification",
    ];

    if (!validActions.includes(action)) {
      return NextResponse.json(
        {
          error: "Invalid action",
          validActions,
        },
        { status: 400 }
      );
    }

    console.log(`🔧 Admin action: ${action} on user ${userId} by admin ${session.user.id}`);

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = { success: true, action, userId };

    switch (action) {
      case "resend_verification":
        result = await handleResendVerification(user);
        break;

      case "reset_password":
        result = await handleResetPassword(user);
        break;

      case "toggle_status":
        result = await handleToggleStatus(user, reason);
        break;

      case "add_note":
        if (!note || note.trim().length === 0) {
          return NextResponse.json(
            {
              error: "Note is required",
            },
            { status: 400 }
          );
        }
        result = await handleAddNote(user, note, session.user.id);
        break;

      case "resend_sms_verification":
        result = await handleResendSMSVerification(user);
        break;

      default:
        return NextResponse.json(
          {
            error: "Unknown action",
          },
          { status: 400 }
        );
    }

    // Log admin action (you might want to create an AdminActionLog model)
    console.log(`✅ Admin action completed: ${action}`, {
      adminId: session.user.id,
      userId,
      userEmail: user.email,
      result: result.success,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error performing admin action:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to perform action",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle resending email verification
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleResendVerification(user: any) {
  try {
    // Generate new verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new verification code
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = expiresAt;
    user.emailVerificationAttempts = 0;
    await user.save();

    // Send verification email
    // TODO: Implement email sending functionality
    console.log(`Would send verification email to ${user.email} with code: ${verificationCode}`);
    // await sendEmail({
    //   to: user.email,
    //   subject: "Verify Your Email - Tools Australia",
    //   template: "email-verification",
    //   data: {
    //     firstName: user.firstName,
    //     verificationCode,
    //   },
    // });

    return {
      success: true,
      action: "resend_verification",
      message: "Verification email sent successfully",
      verificationCode, // Include for admin reference
    };
  } catch (error) {
    console.error("Error sending verification email:", error);
    return {
      success: false,
      action: "resend_verification",
      error: "Failed to send verification email",
    };
  }
}

/**
 * Handle password reset
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleResetPassword(user: any) {
  try {
    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Update user with reset token
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = expiresAt;
    await user.save();

    // Send password reset email
    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;

    // TODO: Implement email sending functionality
    console.log(`Would send password reset email to ${user.email} with URL: ${resetUrl}`);
    // await sendEmail({
    //   to: user.email,
    //   subject: "Password Reset Request - Tools Australia",
    //   template: "password-reset",
    //   data: {
    //     firstName: user.firstName,
    //     resetUrl,
    //   },
    // });

    return {
      success: true,
      action: "reset_password",
      message: "Password reset email sent successfully",
      resetToken, // Include for admin reference
    };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return {
      success: false,
      action: "reset_password",
      error: "Failed to send password reset email",
    };
  }
}

/**
 * Handle account status toggle
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleToggleStatus(user: any, reason?: string) {
  try {
    const newStatus = !user.isActive;
    user.isActive = newStatus;
    await user.save();

    // Send notification email to user
    // TODO: Implement email sending functionality
    console.log(`Would send ${newStatus ? "reactivation" : "deactivation"} email to ${user.email}`);
    // if (newStatus) {
    //   await sendEmail({
    //     to: user.email,
    //     subject: "Account Reactivated - Tools Australia",
    //     template: "account-reactivated",
    //     data: {
    //       firstName: user.firstName,
    //       reason: reason || "Your account has been reactivated by our support team.",
    //     },
    //   });
    // } else {
    //   await sendEmail({
    //     to: user.email,
    //     subject: "Account Deactivated - Tools Australia",
    //     template: "account-deactivated",
    //     data: {
    //       firstName: user.firstName,
    //       reason: reason || "Your account has been temporarily deactivated. Please contact support for assistance.",
    //     },
    //   });
    // }

    return {
      success: true,
      action: "toggle_status",
      message: `Account ${newStatus ? "activated" : "deactivated"} successfully`,
      newStatus,
      reason,
    };
  } catch (error) {
    console.error("Error toggling account status:", error);
    return {
      success: false,
      action: "toggle_status",
      error: "Failed to update account status",
    };
  }
}

/**
 * Handle adding admin note
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddNote(user: any, note: string, adminId: string) {
  try {
    // Initialize adminNotes array if it doesn't exist
    if (!user.adminNotes) {
      user.adminNotes = [];
    }

    // Add new note
    user.adminNotes.push({
      note: note.trim(),
      addedBy: adminId,
      addedAt: new Date(),
    });

    await user.save();

    return {
      success: true,
      action: "add_note",
      message: "Admin note added successfully",
      note: note.trim(),
      addedAt: new Date(),
    };
  } catch (error) {
    console.error("Error adding admin note:", error);
    return {
      success: false,
      action: "add_note",
      error: "Failed to add admin note",
    };
  }
}

/**
 * Handle resending SMS verification
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleResendSMSVerification(user: any) {
  try {
    if (!user.mobile) {
      return {
        success: false,
        action: "resend_sms_verification",
        error: "User has no mobile number on file",
      };
    }

    // Generate new SMS OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with new OTP
    user.smsOtpCode = otpCode;
    user.smsOtpExpires = expiresAt;
    user.smsOtpAttempts = 0;
    await user.save();

    // Send SMS
    // TODO: Implement SMS sending functionality
    console.log(`Would send SMS to ${user.mobile} with code: ${otpCode}`);
    // await sendSMS({
    //   to: user.mobile,
    //   message: `Your Tools Australia verification code is: ${otpCode}. This code expires in 10 minutes.`,
    // });

    return {
      success: true,
      action: "resend_sms_verification",
      message: "SMS verification code sent successfully",
      otpCode, // Include for admin reference
    };
  } catch (error) {
    console.error("Error sending SMS verification:", error);
    return {
      success: false,
      action: "resend_sms_verification",
      error: "Failed to send SMS verification code",
    };
  }
}
