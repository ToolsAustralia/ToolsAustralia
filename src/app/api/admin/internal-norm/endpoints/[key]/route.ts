import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import NormEndpointSettings from "@/models/NormEndpointSettings";

const BodySchema = z.object({ disabled: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { key } = await params;
  const body = BodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body" },
      { status: 400 }
    );
  }
  await connectDB();
  await NormEndpointSettings.findOneAndUpdate(
    { registryKey: key },
    {
      $set: {
        disabled: body.data.disabled,
        updatedBy: guard.session.user.id,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  return NextResponse.json({ success: true });
}
