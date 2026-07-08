/**
 * chatStorage.ts
 *
 * Per-user chat localStorage keys and the clearSupportChatStorage() util.
 * Called at sign-out (before server signOut) to prevent chat history / conversationId
 * from leaking to the next user on a shared device.
 *
 * Rule: remove per-user chat keys only. Keep device prefs (theme, etc.).
 * Each removal is individually fault-tolerant so one failure never blocks sign-out.
 *
 * Device-level keys (NOT in CHAT_STORAGE_KEYS, NOT cleared on sign-out):
 *   DISCLOSURE_ACK_KEY — a generic "I've seen the AI privacy notice" flag.
 *   This is device-scoped like a cookie-consent acknowledgement: it persists
 *   across sign-out/sign-in so users are not re-nagged on every session change.
 *   Clearing it on sign-out would nag every user on a shared device; that is
 *   the wrong UX and the wrong privacy posture.
 */

import type { UIMessage } from "ai";

export const CHAT_STORAGE_KEYS = {
  CONVERSATION_ID: "ta_support_chat_conversation_id",
  MESSAGES: "ta_support_chat_messages",
} as const;

/** Maximum number of messages persisted to localStorage to bound storage size. */
const MAX_PERSISTED_MESSAGES = 50;

/**
 * Load persisted chat messages from localStorage.
 * SSR-safe and parse-error-safe — returns [] if window is unavailable or storage is corrupt.
 */
export function loadPersistedMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEYS.MESSAGES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as UIMessage[];
  } catch {
    return [];
  }
}

/**
 * Persist chat messages to localStorage.
 * SSR-safe — no-ops if window is unavailable.
 * Caps storage to the last 50 messages to bound localStorage size.
 * Write failures are silently swallowed (private browsing quota, etc.).
 */
export function savePersistedMessages(messages: UIMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const capped =
      messages.length > MAX_PERSISTED_MESSAGES
        ? messages.slice(-MAX_PERSISTED_MESSAGES)
        : messages;
    window.localStorage.setItem(CHAT_STORAGE_KEYS.MESSAGES, JSON.stringify(capped));
  } catch (err) {
    console.error("[savePersistedMessages] failed to persist messages:", err);
  }
}

/**
 * The device-level key for the first-run AI disclosure acknowledgement.
 * Intentionally NOT included in CHAT_STORAGE_KEYS so clearSupportChatStorage()
 * never removes it. Show the notice once per device; don't re-nag after sign-out.
 */
export const DISCLOSURE_ACK_KEY = "ta_support_chat_disclosure_ack" as const;

/**
 * Returns true if this device has already acknowledged the AI disclosure notice.
 * Safe to call in non-browser environments — returns false (show the notice).
 */
export function hasAcknowledgedDisclosure(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISCLOSURE_ACK_KEY) === "1";
  } catch {
    // Storage blocked (private browsing quota, etc.) — treat as not acknowledged.
    return false;
  }
}

/**
 * Persist the disclosure acknowledgement on this device.
 * Safe to call in non-browser environments — no-ops.
 * A storage write failure is silently swallowed: the worst case is the notice
 * re-appears on next open (acceptable; we just don't block the user).
 */
export function acknowledgeDisclosure(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCLOSURE_ACK_KEY, "1");
  } catch (err) {
    console.error("[acknowledgeDisclosure] failed to persist ack:", err);
  }
}

/**
 * Remove all per-user support-chat keys from localStorage.
 * Safe to call in non-browser environments (server / SSR) — returns immediately.
 * Each key removal is wrapped in its own try/catch so one failure does not block sign-out.
 *
 * DOES NOT remove DISCLOSURE_ACK_KEY — that is a device-level pref, not user data.
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
