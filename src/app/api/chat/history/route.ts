import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { deleteMemberChatHistory } from "@/services/support-chat/deleteMemberChatHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/chat/history
 *
 * Deletes all chat conversations and messages belonging to the authenticated member.
 * Identity comes from the NextAuth session — no client-supplied id is accepted.
 *
 * Response: { success: true, conversationsDeleted: number, messagesDeleted: number }
 */
export async function DELETE() {
  const auth = await requireAuthenticatedUser();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { conversationsDeleted, messagesDeleted } = await deleteMemberChatHistory(
    auth.session.user.id
  );

  return NextResponse.json({ success: true, conversationsDeleted, messagesDeleted });
}
