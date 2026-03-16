import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import User from "@/models/User";

export async function requireAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { errorResponse: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdminUser() {
  const authResult = await requireAuthenticatedUser();
  if ("errorResponse" in authResult) {
    return authResult;
  }

  const user = await User.findOne({ email: authResult.session.user.email }).select("_id email role");
  if (!user || user.role !== "admin") {
    return { errorResponse: NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 }) };
  }

  return { session: authResult.session, adminUser: user };
}
