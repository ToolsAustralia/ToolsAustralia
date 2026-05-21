import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import ContactSubmission from "@/models/ContactSubmission";
import PartnerApplication from "@/models/PartnerApplication";

/**
 * GET /api/admin/submissions/unviewed-count
 * Get count of unviewed contact submissions and partner applications (admin only)
 */
export async function GET() {
  try {
    const _guard = await requirePermission("overview.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

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
