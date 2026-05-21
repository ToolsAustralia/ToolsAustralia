import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

const PatchSchema = z.object({
  roleId: z.string().min(1).optional(),
  resendInvite: z.boolean().optional(),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid staff id" }, { status: 400 });
  }

  await connectDB();
  const guard = await requirePermissionWithAudit("settings.edit", req, {
    resourceType: "User",
    resourceId: id,
  });
  if (guard instanceof NextResponse) return guard;
  const { session, log } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const user = await User.findById(id);
  if (!user || (user.userType !== "staff" && user.userType !== "admin")) {
    return NextResponse.json({ error: "Staff user not found" }, { status: 404 });
  }

  if (parsed.data.roleId) {
    if (!isValidObjectId(parsed.data.roleId)) {
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }
    const role = await Role.findById(parsed.data.roleId).select("name").lean();
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    const roleChanged =
      (user.roleId?.toString() ?? null) !== role._id.toString();
    // Inviting/moving into Admin role keeps super-admin powers; otherwise
    // demote to custom-role staff.
    user.roleId = role._id;
    user.userType = role.name === "Admin" ? "admin" : "staff";
    user.role = user.userType === "admin" ? "admin" : "user";
    // Force-sign-out the affected user on the next request so the new role
    // takes effect immediately (no 5-minute permission cache drift).
    if (roleChanged) {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
  }

  if (parsed.data.resendInvite) {
    if (user.isActive) {
      return NextResponse.json(
        { error: "User has already activated their account" },
        { status: 409 }
      );
    }
    user.inviteToken = randomUUID();
    user.inviteTokenExpires = new Date(Date.now() + INVITE_TTL_MS);
    await user.save();

    const role = user.roleId
      ? await Role.findById(user.roleId).select("name").lean()
      : null;
    const inviteLink = `${process.env.NEXTAUTH_URL}/staff-setup/${user.inviteToken}`;
    const inviterName =
      `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() ||
      "Tools Australia";

    await sendStaffInviteEmail({
      to: user.email,
      inviteeName: user.firstName,
      roleName: role?.name ?? "Staff",
      inviteLink,
      inviterName,
    });
    await log(200);
    return NextResponse.json({ success: true });
  }

  await user.save();
  await log(200);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid staff id" }, { status: 400 });
  }

  await connectDB();
  const guard = await requirePermissionWithAudit("settings.delete", req, {
    resourceType: "User",
    resourceId: id,
  });
  if (guard instanceof NextResponse) return guard;
  const { session, log } = guard;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 });
  }

  const user = await User.findById(id);
  if (!user || (user.userType !== "staff" && user.userType !== "admin")) {
    return NextResponse.json({ error: "Staff user not found" }, { status: 404 });
  }

  user.userType = "customer";
  user.roleId = null;
  user.role = "user";
  user.isActive = false;
  user.inviteToken = undefined;
  user.inviteTokenExpires = undefined;
  // Force-sign-out the removed user on the next request so they lose admin
  // access immediately even if their JWT cookie is still valid.
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save({ validateBeforeSave: false });

  await log(200);
  return NextResponse.json({ success: true });
}
