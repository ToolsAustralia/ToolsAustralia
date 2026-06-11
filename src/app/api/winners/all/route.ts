import { NextRequest, NextResponse } from "next/server";
import { getAllWinners } from "@/utils/draws/get-all-winners";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const drawTypeParam = searchParams.get("drawType"); // "major" | "mini" | null (all)
    const drawType = drawTypeParam === "major" || drawTypeParam === "mini" ? drawTypeParam : null;

    const winners = await getAllWinners({ limit, drawType });

    return NextResponse.json(
      {
        success: true,
        winners,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching all winners:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch winners",
      },
      { status: 500 }
    );
  }
}
