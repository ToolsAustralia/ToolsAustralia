import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAffiliateSession } from "@/utils/affiliate/get-affiliate-session";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import bcrypt from "bcryptjs";

const updateAccountSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  username: z.string().optional(),
  password: z.string().optional(),
});

/**
 * PUT /api/affiliate/update-account
 * Update affiliate username and/or password
 * Requires current password verification
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify affiliate authentication
    const session = await getAffiliateSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateAccountSchema.parse(body);

    await connectDB();

    // Get affiliate
    const affiliate = await Affiliate.findById(session.affiliateId);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(validatedData.currentPassword, affiliate.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    // Update username if provided
    if (validatedData.username) {
      const trimmedUsername = validatedData.username.toLowerCase().trim();
      
      // Check for uniqueness
      const existingAffiliate = await Affiliate.findOne({
        username: trimmedUsername,
        _id: { $ne: session.affiliateId },
      });
      
      if (existingAffiliate) {
        return NextResponse.json({ error: "Username already exists" }, { status: 400 });
      }
      
      affiliate.username = trimmedUsername;
    }

    // Update password if provided
    if (validatedData.password) {
      if (validatedData.password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      
      affiliate.password = await bcrypt.hash(validatedData.password, 12);
    }

    await affiliate.save();

    return NextResponse.json({
      success: true,
      message: "Account updated successfully",
    });
  } catch (error) {
    console.error("Error updating affiliate account:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

