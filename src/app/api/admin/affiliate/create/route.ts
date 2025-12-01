import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import { generateUniqueAffiliateCode } from "@/lib/affiliate";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const createAffiliateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name cannot be more than 100 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username cannot be more than 50 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  commissionRate: z.number().min(0, "Commission rate must be at least 0").max(1, "Commission rate cannot exceed 100%").optional(),
});

/**
 * POST /api/admin/affiliate/create
 * Admin creates a new affiliate account
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createAffiliateSchema.parse(body);

    await connectDB();

    // Check if email already exists
    const existingEmail = await Affiliate.findOne({ email: validatedData.email.toLowerCase() });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    // Check if username already exists
    const existingUsername = await Affiliate.findOne({ username: validatedData.username.toLowerCase().trim() });
    if (existingUsername) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 });
    }

    // Generate unique affiliate code
    const affiliateCode = await generateUniqueAffiliateCode();
    // Use the same environment variable as the rest of the codebase
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
    // Link to promotion page with affiliate code
    const affiliateLink = `${baseUrl}/promotions/${DEFAULT_PRIZE_SLUG}?aff=${affiliateCode}`;

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Create affiliate account
    const affiliate = new Affiliate({
      name: validatedData.name.trim(),
      email: validatedData.email.toLowerCase().trim(),
      phone: validatedData.phone?.trim(),
      username: validatedData.username.toLowerCase().trim(),
      password: hashedPassword,
      affiliateCode,
      affiliateLink,
      isActive: true,
      commissionRate: validatedData.commissionRate ?? 0.3, // Default to 30% if not provided
      totalSignups: 0,
      totalSales: 0,
      totalCommissions: 0,
    });

    await affiliate.save();
    const affiliateId = (affiliate._id as mongoose.Types.ObjectId).toString();

    return NextResponse.json({
      success: true,
      data: {
        affiliate: {
          id: affiliateId,
          name: affiliate.name,
          email: affiliate.email,
          username: affiliate.username,
          affiliateCode: affiliate.affiliateCode,
          affiliateLink: affiliate.affiliateLink,
        },
      },
    });
  } catch (error) {
    console.error("Error creating affiliate:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create affiliate account" }, { status: 500 });
  }
}

