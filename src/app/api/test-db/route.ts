import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

export async function GET() {
  try {
    console.log("🔍 Testing database connection...");
    await connectDB();
    console.log("✅ Database connected successfully");

    const userCount = await User.countDocuments();
    console.log(`📊 Total users in database: ${userCount}`);

    // Test finding a specific user (replace with actual test email)
    const testEmail = "test@example.com";
    const testUser = await User.findOne({ email: testEmail });

    return NextResponse.json({
      success: true,
      message: "Database connection successful",
      data: {
        userCount,
        testUserExists: !!testUser,
        testUserEmail: testEmail,
        testUserActive: testUser?.isActive,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });
    }

    console.log(`🔍 Testing authentication for: ${email}`);
    await connectDB();

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found",
        data: { email, userExists: false },
      });
    }

    // Import bcrypt for password comparison
    const bcrypt = await import("bcryptjs");
    const isPasswordValid = user.password ? await bcrypt.compare(password, user.password) : false;

    return NextResponse.json({
      success: true,
      message: "Authentication test completed",
      data: {
        email,
        userExists: true,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        passwordValid: isPasswordValid,
        role: user.role,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Authentication test failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
