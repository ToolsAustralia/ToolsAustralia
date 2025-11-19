import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Validation schema for full setup
const setupSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  state: z.string().min(1, "State is required"),
  profession: z.string().min(1, "Profession is required").max(100, "Profession cannot exceed 100 characters"),
});

// Validation schema for email verification only
const emailVerificationSchema = z.object({
  completeSetupOnly: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();

    await connectDB();

    // Find user
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if this is email verification only (user already has password and state)
    if (body.completeSetupOnly) {
      // User is just completing email verification - they already have password and state
      if (!user.password || !user.state) {
        return NextResponse.json({ error: "User must complete full setup first" }, { status: 400 });
      }

      // Just mark setup as completed
      user.profileSetupCompleted = true;
      await user.save();

      console.log(`✅ User email verification completed for: ${user.email}`);
    } else {
      // Full setup flow - validate password and state
      const validationResult = setupSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json({ error: "Invalid input", details: validationResult.error.issues }, { status: 400 });
      }

      const { password, state, profession } = validationResult.data;

      // Validate state code
      const validStates = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
      if (!validStates.includes(state.toUpperCase())) {
        return NextResponse.json({ error: "Invalid state code" }, { status: 400 });
      }

      // Validate profession (trim and ensure it's not empty)
      const trimmedProfession = profession.trim();
      if (!trimmedProfession || trimmedProfession.length === 0) {
        return NextResponse.json({ error: "Profession is required" }, { status: 400 });
      }
      if (trimmedProfession.length > 100) {
        return NextResponse.json({ error: "Profession cannot exceed 100 characters" }, { status: 400 });
      }

      // Check if user already has a password and state set
      if (user.password && user.state) {
        return NextResponse.json({ error: "User setup already completed" }, { status: 400 });
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Update user
      user.password = hashedPassword;
      user.state = state.toUpperCase();
      user.profession = trimmedProfession;
      user.profileSetupCompleted = true; // Mark setup as completed
      await user.save();

      console.log(`✅ User setup completed for: ${user.email}`);
    }

    // ✅ Update Klaviyo profile with latest user data after setup completion
    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      console.log(`📊 Updating Klaviyo profile after user setup completion`);
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo profile sync error (non-critical):", klaviyoError);
    }

    return NextResponse.json({
      success: true,
      message: "User setup completed successfully",
    });
  } catch (error) {
    console.error("❌ User setup error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
