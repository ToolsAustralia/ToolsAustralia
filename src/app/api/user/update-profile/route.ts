import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { GENDER_VALUES, type GenderValue } from "@/data/genders";

const updateProfileSchema = z.object({
  mobile: z
    .string()
    .min(6, "Phone number must be at least 6 characters")
    .max(30, "Phone number is too long")
    .trim()
    .optional(),
  state: z
    .string()
    .optional()
    .refine(
      (value) => !value || AUSTRALIAN_STATES.some((state) => state.code === value.toUpperCase()),
      "State must be a valid Australian state code"
    ),
  profession: z
    .string()
    .max(100, "Profession cannot exceed 100 characters")
    .optional()
    .transform((val) => (val?.trim() || undefined)),
  // Optional field. An empty string is accepted and normalized to `undefined` so a member can
  // CLEAR a previously-set gender, not just change it — same shape as `profession` above.
  gender: z
    .string()
    .optional()
    .transform((val) => val?.trim().toLowerCase() || undefined)
    .refine(
      (val) => !val || GENDER_VALUES.includes(val as (typeof GENDER_VALUES)[number]),
      "Gender must be either 'male' or 'female'"
    ),
  birthdate: z
    .string()
    .optional()
    .refine(
      (val) => !val || (new Date(val).getTime() <= Date.now() && !isNaN(new Date(val).getTime())),
      "Birthdate cannot be in the future"
    )
    .transform((val) => (val?.trim() || undefined)),
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

    if (parsed.data.state !== undefined) {
      user.state = parsed.data.state ? parsed.data.state.toUpperCase() : undefined;
    }

    if (parsed.data.profession !== undefined) {
      user.profession = parsed.data.profession;
    }

    if (parsed.data.birthdate !== undefined) {
      user.birthdate = parsed.data.birthdate ? new Date(parsed.data.birthdate) : undefined;
    }

    // `hasOwnProperty` rather than `!== undefined`: the Zod transform maps "" → undefined so a
    // member can clear the field, and a bare `!== undefined` check would silently ignore that.
    if (Object.prototype.hasOwnProperty.call(body, "gender")) {
      user.gender = parsed.data.gender as GenderValue | undefined;
    }

    await user.save();

    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo profile sync error (non-critical):", klaviyoError);
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id.toString(),
        mobile: user.mobile,
        state: user.state,
        profession: user.profession,
        gender: user.gender,
        birthdate: user.birthdate?.toISOString?.()?.split("T")[0],
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
