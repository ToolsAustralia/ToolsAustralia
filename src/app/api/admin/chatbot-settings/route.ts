import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { handleApiError } from "@/lib/errors/handlers";
import {
  getActiveChatProvider,
  setActiveChatProvider,
} from "@/lib/support-chat/chatSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  activeProvider: z.enum(["anthropic", "google"]),
});

export async function GET(_request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    const activeProvider = await getActiveChatProvider();
    return NextResponse.json(
      { data: { activeProvider }, meta: { timestamp: new Date().toISOString() } },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "activeProvider must be 'anthropic' or 'google'" } },
        { status: 400 }
      );
    }

    await setActiveChatProvider(parsed.data.activeProvider);
    const activeProvider = await getActiveChatProvider();
    return NextResponse.json(
      { data: { activeProvider }, meta: { timestamp: new Date().toISOString() } },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
