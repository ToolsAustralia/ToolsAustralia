import { NextRequest, NextResponse } from "next/server";
import { emailService, generateEmailVerificationCode } from "@/lib/email/";

/**
 * POST /api/test/email-verification
 * Test endpoint to verify email sending works
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🧪 Testing email verification...");

    const body = await request.json();
    const { email, userName } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const verificationCode = generateEmailVerificationCode();
    console.log(`📧 Generated test code: ${verificationCode}`);

    const result = await emailService.sendVerificationEmail(email, {
      userName: userName || "Test User",
      verificationCode,
    });

    if (result.success) {
      console.log(`✅ Test email sent successfully to ${email}`);
      return NextResponse.json({
        success: true,
        message: "Test email sent successfully",
        verificationCode,
        messageId: result.messageId,
      });
    } else {
      console.error(`❌ Failed to send test email: ${result.error}`);
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to send test email",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("❌ Test email error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
