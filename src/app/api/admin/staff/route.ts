import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

const InviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  roleId: z.string().min(1),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  await connectDB();
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;

  // Internal users = anyone with userType `staff` or `admin` (the owner is `admin`).
  const staff = await User.find({ userType: { $in: ["staff", "admin"] } })
    .select(
      "firstName lastName email isActive isEmailVerified roleId userType inviteToken inviteTokenExpires invitedAt"
    )
    .lean();

  const roleIds = [
    ...new Set(
      staff
        .map((s) => s.roleId?.toString())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const roles = await Role.find({ _id: { $in: roleIds } })
    .select("name color")
    .lean();
  const roleMap = new Map(
    roles.map((r) => [r._id.toString(), { name: r.name, color: r.color ?? null }])
  );

  const now = new Date();
  return NextResponse.json({
    success: true,
    data: staff.map((s) => ({
      id: s._id.toString(),
      email: s.email,
      firstName: s.firstName,
      lastName: s.lastName,
      isActive: s.isActive,
      isEmailVerified: s.isEmailVerified,
      userType: s.userType,
      roleId: s.roleId?.toString() ?? null,
      roleName: s.roleId ? roleMap.get(s.roleId.toString())?.name ?? null : null,
      roleColor: s.roleId ? roleMap.get(s.roleId.toString())?.color ?? null : null,
      inviteStatus:
        !s.isActive && s.inviteToken
          ? s.inviteTokenExpires && s.inviteTokenExpires < now
            ? "expired"
            : "pending"
          : "active",
      invitedAt: s.invitedAt ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const guard = await requirePermissionWithAudit("settings.edit", req, {
    resourceType: "User",
  });
  if (guard instanceof NextResponse) return guard;
  const { session, log } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  if (!isValidObjectId(parsed.data.roleId)) {
    return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
  }

  const role = await Role.findById(parsed.data.roleId).select("name").lean();
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const existing = await User.findOne({ email: parsed.data.email });
  if (existing) {
    if (
      (existing.userType === "staff" || existing.userType === "admin") &&
      existing.isActive
    ) {
      return NextResponse.json(
        { error: "A staff account already exists for this email" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error:
          "An account with this email already exists. Use a different email.",
      },
      { status: 409 }
    );
  }

  // Inviting into the Admin role grants super-admin (userType=admin); any
  // other role makes the invitee a custom-role staff member.
  const userType: "staff" | "admin" = role.name === "Admin" ? "admin" : "staff";

  const token = randomUUID();
  const expires = new Date(Date.now() + INVITE_TTL_MS);

  await User.create({
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    userType,
    roleId: parsed.data.roleId,
    role: userType === "admin" ? "admin" : "user", // legacy field
    isActive: false,
    isEmailVerified: false,
    inviteToken: token,
    inviteTokenExpires: expires,
    invitedBy: session.user.id,
    invitedAt: new Date(),
  });

  const inviteLink = `${process.env.NEXTAUTH_URL}/staff-setup/${token}`;
  const inviterName =
    `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() ||
    "Tools Australia";

  await sendStaffInviteEmail({
    to: parsed.data.email,
    inviteeName: parsed.data.firstName,
    roleName: role.name,
    inviteLink,
    inviterName,
  });

  await log(201);
  return NextResponse.json({ success: true }, { status: 201 });
}
