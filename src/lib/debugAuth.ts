import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Utility function to protect debug/test endpoints
 * Only allows access in development mode or for admin users
 */
export async function protectDebugEndpoint() {
  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!isDevelopment) {
    return {
      error: "Debug endpoints are only available in development mode",
      status: 403,
    };
  }

  // Get the authenticated user session
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: "Authentication required for debug endpoints",
      status: 401,
    };
  }

  // Check if user is admin (optional additional protection)
  // You can uncomment this if you want to restrict debug endpoints to admin users only
  /*
  if (session.user.role !== "admin") {
    return {
      error: "Admin access required for debug endpoints",
      status: 403,
    };
  }
  */

  return { success: true, user: session.user };
}
