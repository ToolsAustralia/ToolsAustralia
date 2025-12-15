import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";

const updateProfileSchema = z.object({
  mobile: z
    .string()
    .min(6, "Phone number must be at least 6 characters")
    .max(30, "Phone number is too long")
    .trim()
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (typeof parsed.data.mobile === "string") {
      const newMobile = parsed.data.mobile;

      // Ensure the new mobile number is not already used by another user
      const existingUserWithMobile = await User.findOne({
        mobile: newMobile,
        _id: { $ne: user._id },
      });

      if (existingUserWithMobile) {
        return NextResponse.json(
          {
            error: "Phone number already in use",
            field: "mobile",
            message: "An account with this phone number already exists. Please use a different number.",
          },
          { status: 400 }
        );
      }

      user.mobile = newMobile;
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      user: { id: user._id.toString(), mobile: user.mobile },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
