import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ContactSubmission from "@/models/ContactSubmission";
import PartnerApplication from "@/models/PartnerApplication";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/admin/submissions/unviewed-count
 * Get count of unviewed contact submissions and partner applications (admin only)
 */
export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const unreadQuery = { $or: [{ readAt: null }, { readAt: { $exists: false } }] };
    const [contactCount, partnerCount] = await Promise.all([
      ContactSubmission.countDocuments(unreadQuery),
      PartnerApplication.countDocuments(unreadQuery),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        contact: contactCount,
        partner: partnerCount,
        total: contactCount + partnerCount,
      },
    });
  } catch (error) {
    console.error("Error fetching unviewed submissions count:", error);
    return NextResponse.json({ error: "Failed to fetch unviewed count" }, { status: 500 });
  }
}
