/**
 * chatStorage.ts
 *
 * Per-user chat localStorage keys and the clearSupportChatStorage() util.
 * Called at sign-out (before server signOut) to prevent chat history / conversationId
 * from leaking to the next user on a shared device.
 *
 * Rule: remove per-user chat keys only. Keep device prefs (theme, etc.).
 * Each removal is individually fault-tolerant so one failure never blocks sign-out.
 */

export const CHAT_STORAGE_KEYS = {
  CONVERSATION_ID: "ta_support_chat_conversation_id",
} as const;

/**
 * Remove all per-user support-chat keys from localStorage.
 * Safe to call in non-browser environments (server / SSR) — returns immediately.
 * Each key removal is wrapped in its own try/catch so one failure does not block sign-out.
 */
export function clearSupportChatStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.values(CHAT_STORAGE_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.error("[clearSupportChatStorage] failed to remove key:", key, err);
    }
  }
}
