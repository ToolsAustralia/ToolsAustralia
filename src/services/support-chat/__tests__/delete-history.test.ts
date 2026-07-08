/**
 * delete-history.test.ts
 *
 * Unit tests for deleteMemberChatHistory.
 * Runs with NO Mongo — all model operations are injected via deps.
 *
 * Run: npx tsx src/services/support-chat/__tests__/delete-history.test.ts
 *      or: npm run test:chat-delete-history
 */

import { deleteMemberChatHistory } from "../deleteMemberChatHistory";
import type { DeleteHistoryDeps } from "../deleteMemberChatHistory";
import type { Types } from "mongoose";

// ── Minimal assertion helpers (no test runner required) ──────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

// ── Stub factory ──────────────────────────────────────────────────────────────
function makeIds(n: number): Types.ObjectId[] {
  // Use plain objects that satisfy the structural type requirement
  return Array.from({ length: n }, (_, i) => ({ toString: () => `id-${i}` } as unknown as Types.ObjectId));
}

function makeDeps(overrides?: Partial<{
  findIds: Types.ObjectId[];
  deletedMessages: number;
  deletedConversations: number;
  findCalledWith?: string[];
  deleteMessagesCalledWith?: Types.ObjectId[][];
  deleteConversationsCalledWith?: Array<[string, Types.ObjectId[]]>;
}>): DeleteHistoryDeps & {
  findCalledWith: string[];
  deleteMessagesCalledWith: Types.ObjectId[][];
  deleteConversationsCalledWith: Array<[string, Types.ObjectId[]]>;
} {
  const findCalledWith: string[] = [];
  const deleteMessagesCalledWith: Types.ObjectId[][] = [];
  const deleteConversationsCalledWith: Array<[string, Types.ObjectId[]]> = [];

  return {
    findCalledWith,
    deleteMessagesCalledWith,
    deleteConversationsCalledWith,
    findConversationIds: async (uid: string) => {
      findCalledWith.push(uid);
      return overrides?.findIds ?? [];
    },
    deleteMessages: async (ids: Types.ObjectId[]) => {
      deleteMessagesCalledWith.push(ids);
      return overrides?.deletedMessages ?? 0;
    },
    deleteConversations: async (uid: string, ids: Types.ObjectId[]) => {
      deleteConversationsCalledWith.push([uid, ids]);
      return overrides?.deletedConversations ?? 0;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testUserWithNoConversations(): Promise<void> {
  console.log("\n[1] User with no conversations — does nothing destructive");

  const deps = makeDeps({ findIds: [] });
  const result = await deleteMemberChatHistory("user-abc", deps);

  assertEq(result.conversationsDeleted, 0, "conversationsDeleted is 0");
  assertEq(result.messagesDeleted, 0, "messagesDeleted is 0");
  assertEq(deps.findCalledWith, ["user-abc"], "findConversationIds called with userId");
  assertEq(deps.deleteMessagesCalledWith.length, 0, "deleteMessages NOT called (no conversations)");
  assertEq(deps.deleteConversationsCalledWith.length, 0, "deleteConversations NOT called (no conversations)");
}

async function testUserWithConversations(): Promise<void> {
  console.log("\n[2] User with conversations — deletes messages then conversations");

  const ids = makeIds(3);
  const deps = makeDeps({ findIds: ids, deletedMessages: 12, deletedConversations: 3 });
  const result = await deleteMemberChatHistory("user-xyz", deps);

  assertEq(result.conversationsDeleted, 3, "conversationsDeleted matches stub count");
  assertEq(result.messagesDeleted, 12, "messagesDeleted matches stub count");
  assertEq(deps.findCalledWith, ["user-xyz"], "findConversationIds called with the correct userId");
  assertEq(deps.deleteMessagesCalledWith.length, 1, "deleteMessages called exactly once");
  assertEq(deps.deleteMessagesCalledWith[0], ids, "deleteMessages called with the conversation ids");
  assertEq(deps.deleteConversationsCalledWith.length, 1, "deleteConversations called exactly once");
  assertEq(deps.deleteConversationsCalledWith[0]?.[0], "user-xyz", "deleteConversations scoped to the correct userId");
  assertEq(deps.deleteConversationsCalledWith[0]?.[1], ids, "deleteConversations called with the conversation ids");
}

async function testFilterScopedByUserId(): Promise<void> {
  console.log("\n[3] Filter is scoped to the passed userId — no wildcard");

  const ids = makeIds(1);
  const deps = makeDeps({ findIds: ids, deletedMessages: 2, deletedConversations: 1 });
  await deleteMemberChatHistory("user-111", deps);

  // The userId passed to findConversationIds must exactly equal the argument
  assert(deps.findCalledWith[0] === "user-111", "findConversationIds receives exact userId, not wildcard");
  // deleteConversations must also receive the same userId for belt-and-suspenders scoping
  assert(deps.deleteConversationsCalledWith[0]?.[0] === "user-111", "deleteConversations also scoped to userId");
}

async function testDifferentUsersAreIsolated(): Promise<void> {
  console.log("\n[4] Different users are isolated — each call uses only its own userId");

  const ids1 = makeIds(2);
  const ids2 = makeIds(1);
  const deps1 = makeDeps({ findIds: ids1, deletedMessages: 5, deletedConversations: 2 });
  const deps2 = makeDeps({ findIds: ids2, deletedMessages: 3, deletedConversations: 1 });

  const [r1, r2] = await Promise.all([
    deleteMemberChatHistory("user-A", deps1),
    deleteMemberChatHistory("user-B", deps2),
  ]);

  assertEq(deps1.findCalledWith[0], "user-A", "user-A's find uses user-A's id");
  assertEq(deps2.findCalledWith[0], "user-B", "user-B's find uses user-B's id");
  assertEq(r1.conversationsDeleted, 2, "user-A result has correct count");
  assertEq(r2.conversationsDeleted, 1, "user-B result has correct count");
}

async function testReturnShape(): Promise<void> {
  console.log("\n[5] Return value has the correct shape");

  const ids = makeIds(2);
  const deps = makeDeps({ findIds: ids, deletedMessages: 7, deletedConversations: 2 });
  const result = await deleteMemberChatHistory("user-shape", deps);

  assert("conversationsDeleted" in result, "result has conversationsDeleted");
  assert("messagesDeleted" in result, "result has messagesDeleted");
  assert(typeof result.conversationsDeleted === "number", "conversationsDeleted is a number");
  assert(typeof result.messagesDeleted === "number", "messagesDeleted is a number");
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== delete-history tests ===");

  await testUserWithNoConversations();
  await testUserWithConversations();
  await testFilterScopedByUserId();
  await testDifferentUsersAreIsolated();
  await testReturnShape();

  console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("All tests passed.");
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
