import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

export async function GET() {
  try {
    // Get session — open to any authenticated caller; no permission gate
    const session = await getServerSession(authOptions);

    // Connect to DB and get user from database
    await connectDB();
    const dbUser = session?.user?.email
      ? await User.findOne({ email: session.user.email }).select(
          "email role userType roleId firstName lastName _id"
        )
      : null;

    const isStaffInSession = session?.user?.userType === "staff";
    const isStaffInDatabase = dbUser?.userType === "staff";
    // Legacy: a user with role=admin but no userType was an admin before RBAC migration
    const isLegacyAdminInSession = session?.user?.role === "admin" && !isStaffInSession;
    const isLegacyAdminInDatabase = dbUser?.role === "admin" && !isStaffInDatabase;

    return NextResponse.json(
      {
        success: true,
        debug: {
          // Session info
          hasSession: !!session,
          sessionUser: session?.user,
          sessionRole: session?.user?.role,
          sessionUserType: session?.user?.userType,
          sessionPermissions: session?.user?.permissions ?? [],

          // Database info
          databaseUser: dbUser
            ? {
                id: dbUser._id.toString(),
                email: dbUser.email,
                role: dbUser.role,
                userType: dbUser.userType,
                hasRoleId: !!dbUser.roleId,
                firstName: dbUser.firstName,
                lastName: dbUser.lastName,
              }
            : null,

          // Comparison
          rolesMatch: session?.user?.role === dbUser?.role,
          isAdminInSession: session?.user?.role === "admin",
          isAdminInDatabase: dbUser?.role === "admin",
          isStaffInSession,
          isStaffInDatabase,
          isLegacyAdminInSession,
          isLegacyAdminInDatabase,

          // What you need
          nextSteps: isStaffInSession
            ? [
                "✅ Your session has staff userType with RBAC permissions",
                `✅ Permissions: ${(session?.user?.permissions ?? []).join(", ") || "(none)"}`,
                "✅ You should be able to access /admin",
              ]
            : session?.user?.role === "admin"
              ? [
                  "✅ Your session HAS admin role (legacy bridge active — all permissions granted)",
                  "✅ You should be able to access /admin",
                  "If still blocked, check browser console for errors",
                ]
              : [
                  "❌ Your session does NOT have admin/staff access",
                  "🔄 You MUST logout completely",
                  "🧹 Clear browser cookies or use incognito",
                  "🔑 Login again",
                  "✅ Then try /admin again",
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
