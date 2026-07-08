/**
 * GET /api/chat/config — public, unauthenticated widget bootstrap.
 *
 * Returns the single flag the client mount needs: whether Cobber is live. The
 * bubble is hidden site-wide when this is false. `enabled` is the negation of the
 * effective kill state = CHAT_KILL_SWITCH env break-glass OR the admin
 * (ChatSettings) Pause toggle. No PII, no auth — it only exposes an on/off bit.
 *
 * Defense-in-depth: hiding the bubble is a UX affordance only; the paid path is
 * independently blocked server-side in costGuard, so a client that ignores this
 * flag still can't spend against a paused bot.
 */

import { NextResponse } from "next/server";
import { getChatKillSwitchEffective } from "@/lib/support-chat/chatSettings";
import { handleApiError } from "@/lib/errors/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const killed = await getChatKillSwitchEffective();
    return NextResponse.json(
      { data: { enabled: !killed }, meta: { timestamp: new Date().toISOString() } },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
