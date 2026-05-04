import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";

const Body = z.object({
  actionId: z.string().refine((v) => Types.ObjectId.isValid(v), "Invalid actionId"),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth || !("adminUser" in auth)) {
    return auth.errorResponse;
  }

  await connectDB();

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid request body", detail: String(err) },
      { status: 400 }
    );
  }

  try {
    const performedBy = new Types.ObjectId(String(auth.adminUser._id));
    const action = await getAllowlistService().reverse(new Types.ObjectId(body.actionId), performedBy);
    return NextResponse.json({ success: true, action });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Reverse failed" },
      { status: 500 }
    );
  }
}
