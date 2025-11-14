import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    return NextResponse.json({
      success: true,
      session: session,
      user: session?.user,
      token: {
        hasSession: !!session,
        hasUser: !!session?.user,
        email: session?.user?.email,
        role: session?.user?.role,
        id: session?.user?.id,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
