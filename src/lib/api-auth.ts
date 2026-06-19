import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

export async function requireAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { errorResponse: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

/**
 * Resolve the authenticated user's database document from the NextAuth session.
 *
 * This is the single, signature-verified way for authenticated API routes to
 * load the calling user's record. It replaces the per-route `getUserFromToken`
 * helpers that read `Authorization: Bearer <token>` and, on verify failure,
 * fell back to treating the raw string as a Mongo `_id` (an auth bypass).
 *
 * Identity comes only from the NextAuth session cookie, which the browser sends
 * automatically — so callers must NOT read a bearer token. Deactivated/deleted
 * users are already rejected upstream: the NextAuth `session` callback returns
 * null when `tokenVersion`/`isActive` invalidate the token, so `getServerSession`
 * yields no session for them.
 */
export async function requireAuthenticatedUserDoc() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { errorResponse: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }

  await connectDB();
  const user = await User.findById(session.user.id);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: "Unauthorized", code: "USER_NOT_FOUND" },
        { status: 401 }
      ),
    };
  }

  return { session, user };
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
