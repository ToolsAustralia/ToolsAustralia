/**
 * deleteMemberChatHistory.ts
 *
 * Deletes all chat history scoped to a single authenticated member.
 * Identity comes from the caller (route handler, which gets it from the NextAuth session)
 * — never from client-supplied data.
 *
 * Deletion order:
 *   1. Find all ChatConversation _ids for this userId.
 *   2. Delete all ChatMessage docs whose conversationId is in that set.
 *   3. Delete the ChatConversation docs (scoped by both _id and userId for belt-and-suspenders).
 *
 * Makes model ops injectable via optional `deps` so tests run with no Mongo.
 */

import connectDB from "@/lib/mongodb";
import ChatConversation from "@/models/ChatConversation";
import ChatMessage from "@/models/ChatMessage";
import type { Types } from "mongoose";

export interface DeleteHistoryResult {
  conversationsDeleted: number;
  messagesDeleted: number;
}

export interface DeleteHistoryDeps {
  findConversationIds?: (userId: string) => Promise<Types.ObjectId[]>;
  deleteMessages?: (conversationIds: Types.ObjectId[]) => Promise<number>;
  deleteConversations?: (userId: string, conversationIds: Types.ObjectId[]) => Promise<number>;
}

export async function deleteMemberChatHistory(
  userId: string,
  deps?: DeleteHistoryDeps
): Promise<DeleteHistoryResult> {
  // Default implementations use real Mongoose models.
  // All ops are scoped by userId — the passed userId comes from the session (never from
  // a client-supplied value). No client-supplied id is ever trusted here.
  const findConversationIds =
    deps?.findConversationIds ??
    (async (uid: string) => {
      await connectDB();
      const docs = await ChatConversation.find({ userId: uid }, { _id: 1 }).lean();
      return docs.map((d) => d._id as Types.ObjectId);
    });

  const deleteMessages =
    deps?.deleteMessages ??
    (async (conversationIds: Types.ObjectId[]) => {
      if (conversationIds.length === 0) return 0;
      const result = await ChatMessage.deleteMany({
        conversationId: { $in: conversationIds },
      });
      return result.deletedCount ?? 0;
    });

  const deleteConversations =
    deps?.deleteConversations ??
    (async (uid: string, conversationIds: Types.ObjectId[]) => {
      if (conversationIds.length === 0) return 0;
      // Scope the delete by BOTH userId and _id — belt-and-suspenders so a
      // race-condition or id collision cannot delete another user's conversation.
      const result = await ChatConversation.deleteMany({
        _id: { $in: conversationIds },
        userId: uid,
      });
      return result.deletedCount ?? 0;
    });

  const conversationIds = await findConversationIds(userId);

  if (conversationIds.length === 0) {
    return { conversationsDeleted: 0, messagesDeleted: 0 };
  }

  const messagesDeleted = await deleteMessages(conversationIds);
  const conversationsDeleted = await deleteConversations(userId, conversationIds);

  return { conversationsDeleted, messagesDeleted };
}
