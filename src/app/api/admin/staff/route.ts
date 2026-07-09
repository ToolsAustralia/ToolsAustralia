import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isValidObjectId, Types } from "mongoose";
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
  if (existing?.isActive) {
    // An ACTIVE account can't be converted through the invite lifecycle
    // (staff-setup requires isActive:false to activate). Active staff are
    // managed from this page; active customers would be locked out of the
    // site if we deactivated them pending an email click.
    if (existing.userType === "staff" || existing.userType === "admin") {
      return NextResponse.json(
        { error: "A staff account already exists for this email" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error:
          "This email belongs to an active customer account. Staff invites can't convert an active account.",
      },
      { status: 409 }
    );
  }

  // Inviting into the Admin role grants super-admin (userType=admin); any
  // other role makes the invitee a custom-role staff member.
  const userType: "staff" | "admin" = role.name === "Admin" ? "admin" : "staff";

  const token = randomUUID();
  const expires = new Date(Date.now() + INVITE_TTL_MS);

  if (existing) {
    // Only rows with STAFF-WORKFLOW history may be converted: a pending/expired
    // invite (still userType staff/admin) or a previously-removed staff member
    // (DELETE demotes to customer but retains invitedAt/invitedBy). A plain
    // deactivated CUSTOMER (never invited) must not be silently converted —
    // their account carries purchase/Stripe history and an admin typo here
    // would overwrite their identity with a staff invite.
    const wasStaffWorkflow =
      existing.userType === "staff" ||
      existing.userType === "admin" ||
      Boolean(existing.invitedAt);
    if (!wasStaffWorkflow) {
      return NextResponse.json(
        {
          error:
            "This email belongs to an existing customer account. Staff invites can only re-invite former staff — manage customer accounts from the Users page.",
        },
        { status: 409 }
      );
    }

    // Re-invite an INACTIVE former-staff account: a previously-removed staff
    // member (DELETE demotes to customer + isActive:false and keeps the row
    // for audit history — the remove dialog promises "you can re-invite them
    // later"), or a pending/expired invite being re-sent with a new role.
    // Convert in place: the account re-enters the normal invite lifecycle
    // and staff-setup will set a fresh password + isActive:true.
    existing.firstName = parsed.data.firstName;
    existing.lastName = parsed.data.lastName;
    existing.userType = userType;
    existing.roleId = role._id;
    existing.role = userType === "admin" ? "admin" : "user"; // legacy field
    existing.inviteToken = token;
    existing.inviteTokenExpires = expires;
    existing.invitedBy = new Types.ObjectId(session.user.id);
    existing.invitedAt = new Date();
    // Invalidate any stale session immediately (same as role changes).
    existing.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    // validateBeforeSave:false for the same reason as the DELETE demote flow:
    // an older record may not satisfy every current schema invariant, and we
    // set the staff-invite shape explicitly above.
    await existing.save({ validateBeforeSave: false });
  } else {
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
  }

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
