import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { RedeemablesWalletService } from "@/services/redeemables";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    const limit = Number(request.nextUrl.searchParams.get("limit") || "10");
    const status = request.nextUrl.searchParams.get("status");
    const wallet = await RedeemablesWalletService.getUserWallet(authResult.session.user.id, {
      page,
      limit,
      status: status === "claimable" || status === "past" ? status : undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        wallet: wallet.items,
        total: wallet.total,
        page: wallet.page,
        totalPages: wallet.totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching redeemables wallet:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch redeemables wallet" }, { status: 500 });
  }
}
