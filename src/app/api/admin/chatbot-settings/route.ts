import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { handleApiError } from "@/lib/errors/handlers";
import {
  getActiveChatProvider,
  setActiveChatProvider,
  getDbChatKillSwitch,
  setChatKillSwitch,
  isChatKillSwitchEnvOn,
} from "@/lib/support-chat/chatSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// At least one field must be present. `killSwitch` is the admin Pause toggle
// (DB-backed); `activeProvider` is the LLM selector.
const patchSchema = z
  .object({
    activeProvider: z.enum(["anthropic", "google"]).optional(),
    killSwitch: z.boolean().optional(),
  })
  .refine(
    (d) => d.activeProvider !== undefined || d.killSwitch !== undefined,
    { message: "Provide activeProvider and/or killSwitch" }
  );

/** The full settings snapshot returned by GET/PATCH. */
async function readSettings() {
  const [activeProvider, killSwitch] = await Promise.all([
    getActiveChatProvider(),
    getDbChatKillSwitch(),
  ]);
  // envForced: the CHAT_KILL_SWITCH env override is on, so the admin toggle
  // can't re-enable Cobber until it's cleared in the host env.
  return { activeProvider, killSwitch, killSwitchEnvForced: isChatKillSwitchEnvOn() };
}

export async function GET(_request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    return NextResponse.json(
      { data: await readSettings(), meta: { timestamp: new Date().toISOString() } },
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
        {
          error: {
            code: "BAD_REQUEST",
            message:
              "Provide activeProvider ('anthropic'|'google') and/or killSwitch (boolean)",
          },
        },
        { status: 400 }
      );
    }

    if (parsed.data.activeProvider !== undefined) {
      await setActiveChatProvider(parsed.data.activeProvider);
    }
    if (parsed.data.killSwitch !== undefined) {
      await setChatKillSwitch(parsed.data.killSwitch);
    }

    return NextResponse.json(
      { data: await readSettings(), meta: { timestamp: new Date().toISOString() } },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
