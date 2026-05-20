import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import connectDB from "@/lib/mongodb";
import Role from "@/models/Role";
import User from "@/models/User";
import { requirePermission } from "@/lib/api-auth-permissions";
import { isValidPermission } from "@/lib/permissions";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const PatchRoleSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z
    .string()
    .regex(HEX_COLOR_RE, "color must be a 6-digit hex string like #ee0000")
    .optional(),
  permissions: z
    .array(z.string())
    .refine((perms) => perms.every(isValidPermission), {
      message: "Contains unknown permissions",
    })
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
  }

  await connectDB();
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const role = await Role.findById(id);
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (role.isSystem) {
    if (parsed.data.name && parsed.data.name !== role.name) {
      return NextResponse.json(
        { error: "Cannot rename a system role" },
        { status: 403 }
      );
    }
    if (role.name === "Admin" && parsed.data.permissions) {
      return NextResponse.json(
        { error: "Admin role permissions are managed by the seed script" },
        { status: 403 }
      );
    }
  }

  if (parsed.data.name !== undefined) role.name = parsed.data.name;
  if (parsed.data.color !== undefined) role.color = parsed.data.color;
  if (parsed.data.permissions !== undefined) role.permissions = parsed.data.permissions;

  try {
    await role.save();
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      (e.message.includes("duplicate key") || (e as { code?: number }).code === 11000)
    ) {
      return NextResponse.json(
        { error: "A role with that name already exists" },
        { status: 409 }
      );
    }
    console.error("Failed to update role:", e);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
  }

  await connectDB();
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;

  const role = await Role.findById(id);
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (role.isSystem) {
    return NextResponse.json(
      { error: "Cannot delete a system role" },
      { status: 403 }
    );
  }

  const memberCount = await User.countDocuments({ roleId: role._id });
  if (memberCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${memberCount} staff member(s) still hold this role` },
      { status: 409 }
    );
  }

  await Role.deleteOne({ _id: role._id });
  return NextResponse.json({ success: true });
}
