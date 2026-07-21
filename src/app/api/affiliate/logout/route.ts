import { NextResponse } from "next/server";
import { AFFILIATE_COOKIE_NAME } from "@/lib/affiliate-auth";

// Keep in sync with the login route + useAffiliateAuth (the client-readable marker).
const AFFILIATE_UI_MARKER_COOKIE = "affiliate_ui";

/**
 * POST /api/affiliate/logout
 * Clear affiliate session
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  const clearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };

  // Clear the current cookie and the legacy unprefixed name, so a user who logs
  // out during/after the `__Host-` migration is fully signed out either way.
  response.cookies.set(AFFILIATE_COOKIE_NAME, "", clearOptions);
  if (AFFILIATE_COOKIE_NAME !== "affiliate_token") {
    response.cookies.set("affiliate_token", "", clearOptions);
  }

  // Clear the non-httpOnly UI marker too, so the client stops treating this device as an
  // affiliate session at the auth boundary (per the clear-user-scoped-storage-on-sign-out rule).
  response.cookies.set(AFFILIATE_UI_MARKER_COOKIE, "", { ...clearOptions, httpOnly: false });

  return response;
}
