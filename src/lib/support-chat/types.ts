/**
 * Shared actor type for the support-chat domain.
 *
 * Consumed by:
 *   - src/lib/support-chat/withChatbot.ts   (Task 1.6) — identifies the caller
 *   - src/services/support-chat/ChatService.ts (Task 1.7) — gates per-user tools
 *   - src/services/support-chat/escalation.ts  (Task 1.5) — sets subject/context
 *
 * Shape per spec §2:
 *   - `member`    — authenticated user identified via NextAuth session (server-side).
 *                   Only `firstName` and an opaque `userId` are carried — never PII
 *                   like email or phone (those fields don't exist on this type).
 *   - `anonymous` — unauthenticated visitor; identified by a hashed IP/session key
 *                   only. Zero PII.
 *
 * IMPORTANT: identity is always derived server-side from the session cookie.
 * Never accept or trust a client-supplied userId.
 */

export type ChatActor =
  | { kind: "member"; userId: string; firstName: string }
  | { kind: "anonymous"; ipKey: string };
