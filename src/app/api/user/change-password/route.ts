import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
  // Optional: passwordless (OAuth / SMS-OTP / email-code) accounts have no
  // existing password to verify, so this is a first-time "set password".
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { currentPassword, newPassword } = parsed.data;

    // Accounts that already have a password must prove ownership of it.
    // Passwordless accounts (no stored hash — Google OAuth / SMS-OTP /
    // email-code) are identified by the session alone, so this becomes a
    // first-time set with no current password to verify.
    const isFirstTimeSet = !user.password;
    if (!isFirstTimeSet) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }
      const isCurrentValid = await bcrypt.compare(currentPassword, user.password as string);
      if (!isCurrentValid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return NextResponse.json({
      success: true,
      message: isFirstTimeSet ? "Password set successfully" : "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
