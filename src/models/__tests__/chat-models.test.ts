import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ChatConversation from '../ChatConversation';
import ChatMessage from '../ChatMessage';
import ChatDailyBudget from '../ChatDailyBudget';
import ChatAuditLog from '../ChatAuditLog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasTtlIndex(schema: mongoose.Schema, field: string): boolean {
  return schema.indexes().some(([keys, opts]) => {
    return (
      field in (keys as Record<string, unknown>) &&
      typeof (opts as Record<string, unknown>).expireAfterSeconds === 'number'
    );
  });
}

// ---------------------------------------------------------------------------
// ChatConversation
// ---------------------------------------------------------------------------

function testChatConversationValid() {
  const doc = new ChatConversation({
    status: 'open',
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatConversation: valid doc (no userId, defaults) should pass validation'
  );
}

function testChatConversationWithUserId() {
  const doc = new ChatConversation({
    userId: new mongoose.Types.ObjectId(),
    status: 'escalated',
    modelTier: ['haiku', 'sonnet'],
    tokenUsage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1 },
    ipHash: 'abc123',
    userAgent: 'Mozilla/5.0',
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatConversation: fully-populated valid doc should pass validation'
  );
}

function testChatConversationInvalidStatus() {
  const doc = new ChatConversation({ status: 'unknown_status' });
  const err = doc.validateSync();
  assert.ok(err instanceof mongoose.Error.ValidationError, 'ChatConversation: invalid status enum should fail');
}

function testChatConversationTtlIndex() {
  assert.ok(
    hasTtlIndex(ChatConversation.schema, 'updatedAt'),
    'ChatConversation: TTL index on updatedAt should exist'
  );
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

function testChatMessageValid() {
  const doc = new ChatMessage({
    conversationId: new mongoose.Types.ObjectId(),
    role: 'user',
    content: 'Hello, I need help with my membership.',
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatMessage: valid doc should pass validation'
  );
}

function testChatMessageWithCitationsAndToolCalls() {
  const doc = new ChatMessage({
    conversationId: new mongoose.Types.ObjectId(),
    role: 'assistant',
    content: 'Your membership is active.',
    citations: [{ docId: 'membership-faq', span: '§3.1' }],
    toolCalls: [{ name: 'get_my_membership', ok: true, durationMs: 42 }],
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatMessage: doc with citations + toolCalls should pass validation'
  );
}

function testChatMessageMissingRole() {
  const doc = new ChatMessage({
    conversationId: new mongoose.Types.ObjectId(),
    content: 'test',
    // role omitted — required
  });
  const err = doc.validateSync();
  assert.ok(err instanceof mongoose.Error.ValidationError, 'ChatMessage: missing role should fail validation');
}

function testChatMessageMissingConversationId() {
  const doc = new ChatMessage({
    role: 'user',
    content: 'test',
    // conversationId omitted — required
  });
  const err = doc.validateSync();
  assert.ok(
    err instanceof mongoose.Error.ValidationError,
    'ChatMessage: missing conversationId should fail validation'
  );
}

function testChatMessageInvalidRole() {
  const doc = new ChatMessage({
    conversationId: new mongoose.Types.ObjectId(),
    role: 'system', // not in enum
    content: 'test',
  });
  const err = doc.validateSync();
  assert.ok(err instanceof mongoose.Error.ValidationError, 'ChatMessage: invalid role enum should fail validation');
}

function testChatMessageTtlIndex() {
  assert.ok(
    hasTtlIndex(ChatMessage.schema, 'createdAt'),
    'ChatMessage: TTL index on createdAt should exist'
  );
}

// ---------------------------------------------------------------------------
// ChatDailyBudget
// ---------------------------------------------------------------------------

function testChatDailyBudgetValid() {
  const doc = new ChatDailyBudget({ dayKey: '2026-06-24' });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatDailyBudget: valid doc with dayKey should pass validation'
  );
}

function testChatDailyBudgetWithAmounts() {
  const doc = new ChatDailyBudget({
    dayKey: '2026-06-24',
    spentUsd: 1.23,
    tokensIn: 10000,
    tokensOut: 2000,
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatDailyBudget: fully-populated valid doc should pass validation'
  );
}

function testChatDailyBudgetMissingDayKey() {
  const doc = new ChatDailyBudget({ spentUsd: 0.5 });
  const err = doc.validateSync();
  assert.ok(
    err instanceof mongoose.Error.ValidationError,
    'ChatDailyBudget: missing dayKey should fail validation'
  );
}

function testChatDailyBudgetTtlIndex() {
  assert.ok(
    hasTtlIndex(ChatDailyBudget.schema, 'createdAt'),
    'ChatDailyBudget: TTL index on createdAt should exist'
  );
}

// ---------------------------------------------------------------------------
// ChatAuditLog
// ---------------------------------------------------------------------------

function testChatAuditLogValid() {
  const doc = new ChatAuditLog({
    requestId: 'req_abc123',
    actorKind: 'member',
    deflected: true,
    status: 200,
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatAuditLog: valid doc should pass validation'
  );
}

function testChatAuditLogFullyPopulated() {
  const doc = new ChatAuditLog({
    requestId: 'req_abc456',
    conversationId: new mongoose.Types.ObjectId(),
    actorKind: 'anonymous',
    modelTier: 'haiku',
    tokensIn: 500,
    tokensOut: 120,
    deflected: false,
    escalated: false,
    status: 200,
    durationMs: 750,
    ipHash: 'deadbeef',
  });
  assert.strictEqual(
    doc.validateSync(),
    undefined,
    'ChatAuditLog: fully-populated valid doc should pass validation'
  );
}

function testChatAuditLogMissingRequestId() {
  const doc = new ChatAuditLog({
    actorKind: 'member',
    deflected: false,
    status: 200,
    // requestId omitted — required
  });
  const err = doc.validateSync();
  assert.ok(
    err instanceof mongoose.Error.ValidationError,
    'ChatAuditLog: missing requestId should fail validation'
  );
}

function testChatAuditLogInvalidActorKind() {
  const doc = new ChatAuditLog({
    requestId: 'req_xyz',
    actorKind: 'admin', // not in enum
    deflected: false,
    status: 200,
  });
  const err = doc.validateSync();
  assert.ok(
    err instanceof mongoose.Error.ValidationError,
    'ChatAuditLog: invalid actorKind enum should fail validation'
  );
}

function testChatAuditLogTtlIndex() {
  assert.ok(
    hasTtlIndex(ChatAuditLog.schema, 'createdAt'),
    'ChatAuditLog: TTL index on createdAt should exist'
  );
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

function run() {
  // ChatConversation
  testChatConversationValid();
  testChatConversationWithUserId();
  testChatConversationInvalidStatus();
  testChatConversationTtlIndex();

  // ChatMessage
  testChatMessageValid();
  testChatMessageWithCitationsAndToolCalls();
  testChatMessageMissingRole();
  testChatMessageMissingConversationId();
  testChatMessageInvalidRole();
  testChatMessageTtlIndex();

  // ChatDailyBudget
  testChatDailyBudgetValid();
  testChatDailyBudgetWithAmounts();
  testChatDailyBudgetMissingDayKey();
  testChatDailyBudgetTtlIndex();

  // ChatAuditLog
  testChatAuditLogValid();
  testChatAuditLogFullyPopulated();
  testChatAuditLogMissingRequestId();
  testChatAuditLogInvalidActorKind();
  testChatAuditLogTtlIndex();

  console.log('PASS chat-models');
}

run();
