import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

const SetupSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

/**
 * GET /api/auth/staff-setup?token=...
 *
 * Public lookup of an invite by its token. Returns the invitee's first name
 * and email so the setup page can show "Welcome, <name>" before they pick a
 * password. Status 410 if the token doesn't match, has expired, or has been
 * used (no password info leaks either way).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ inviteToken: token })
    .select(
      "email firstName roleId inviteTokenExpires userType isActive"
    )
    .lean();

  if (
    !user ||
    (user.userType !== "staff" && user.userType !== "admin") ||
    user.isActive
  ) {
    return NextResponse.json(
      { error: "Invalid or used invite link" },
      { status: 410 }
    );
  }
  if (!user.inviteTokenExpires || user.inviteTokenExpires < new Date()) {
    return NextResponse.json(
      { error: "This invite link has expired" },
      { status: 410 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      email: user.email,
      firstName: user.firstName,
    },
  });
}

/**
 * POST /api/auth/staff-setup
 * Body: { token, password }
 *
 * Activates the staff account: stores the bcrypt-hashed password, flips
 * `isActive` and `isEmailVerified` to true, and clears the single-use
 * invite token. The user then logs in via the normal /login flow.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ inviteToken: parsed.data.token });
  if (
    !user ||
    (user.userType !== "staff" && user.userType !== "admin")
  ) {
    return NextResponse.json(
      { error: "Invalid or used invite link" },
      { status: 410 }
    );
  }
  if (!user.inviteTokenExpires || user.inviteTokenExpires < new Date()) {
    return NextResponse.json(
      {
        error: "This invite link has expired. Ask your admin to resend it.",
      },
      { status: 410 }
    );
  }
  if (user.isActive) {
    return NextResponse.json(
      { error: "Account already activated" },
      { status: 409 }
    );
  }

  user.password = await bcrypt.hash(parsed.data.password, 12);
  user.isActive = true;
  user.isEmailVerified = true;
  user.inviteToken = undefined;
  user.inviteTokenExpires = undefined;
  await user.save();

  return NextResponse.json({ success: true, data: { email: user.email } });
}
