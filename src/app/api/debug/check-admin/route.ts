import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

export async function GET() {
  try {
    // Get session
    const session = await getServerSession(authOptions);

    // Connect to DB and get user from database
    await connectDB();
    const dbUser = session?.user?.email
      ? await User.findOne({ email: session.user.email }).select("email role firstName lastName _id")
      : null;

    return NextResponse.json(
      {
        success: true,
        debug: {
          // Session info
          hasSession: !!session,
          sessionUser: session?.user,
          sessionRole: session?.user?.role,

          // Database info
          databaseUser: dbUser
            ? {
                id: dbUser._id.toString(),
                email: dbUser.email,
                role: dbUser.role,
                firstName: dbUser.firstName,
                lastName: dbUser.lastName,
              }
            : null,

          // Comparison
          rolesMatch: session?.user?.role === dbUser?.role,
          isAdminInSession: session?.user?.role === "admin",
          isAdminInDatabase: dbUser?.role === "admin",

          // What you need
          nextSteps:
            session?.user?.role !== "admin"
              ? [
                  "❌ Your session does NOT have admin role",
                  "🔄 You MUST logout completely",
                  "🧹 Clear browser cookies or use incognito",
                  "🔑 Login again",
                  "✅ Then try /admin again",
                ]
              : [
                  "✅ Your session HAS admin role",
                  "✅ You should be able to access /admin",
                  "If still blocked, check browser console for errors",
                ],
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
