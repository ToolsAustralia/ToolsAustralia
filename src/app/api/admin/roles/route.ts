import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Role from "@/models/Role";
import User from "@/models/User";
import { requirePermission } from "@/lib/api-auth-permissions";
import { PERMISSIONS, isValidPermission } from "@/lib/permissions";

const CreateRoleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  permissions: z
    .array(z.string())
    .refine((perms) => perms.every(isValidPermission), {
      message: "Contains unknown permissions",
    }),
});

export async function GET() {
  await connectDB();
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;

  const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();

  const ids = roles.map((r) => r._id);
  const memberCounts = await User.aggregate<{ _id: unknown; count: number }>([
    { $match: { roleId: { $in: ids } } },
    { $group: { _id: "$roleId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map<string, number>(
    memberCounts.map((m) => [String(m._id), m.count])
  );

  return NextResponse.json({
    success: true,
    data: {
      roles: roles.map((r) => ({
        id: r._id.toString(),
        name: r.name,
        permissions: r.permissions,
        isSystem: r.isSystem,
        memberCount: countMap.get(r._id.toString()) ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      catalog: PERMISSIONS,
    },
  });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  try {
    const role = await Role.create({
      name: parsed.data.name,
      permissions: parsed.data.permissions,
      isSystem: false,
      createdBy: session.user.id,
    });
    return NextResponse.json(
      { success: true, data: { id: role._id.toString() } },
      { status: 201 }
    );
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
    console.error("Failed to create role:", e);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
