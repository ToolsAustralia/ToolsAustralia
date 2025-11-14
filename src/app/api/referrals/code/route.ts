import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";
import { getOrCreateReferralProfile } from "@/lib/referral";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const profile = await getOrCreateReferralProfile(session.user.id);

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Referral code retrieval error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load referral code",
      },
      { status: 500 }
    );
  }
}
