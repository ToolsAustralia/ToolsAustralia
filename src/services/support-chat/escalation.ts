/**
 * escalation.ts
 *
 * Implements the `request_human` action for the Tools Australia support chatbot.
 *
 * When the bot cannot help, or a user explicitly requests a human agent:
 *   1. Creates a ContactSubmission in MongoDB (persist-first — the queue entry
 *      always exists regardless of email delivery success).
 *   2. Fires the existing SendGrid notification via emailService (best-effort).
 *   3. Returns `{ submissionId }` so ChatService (Task 1.7) can link the
 *      conversation's `escalatedSubmissionId` and set status → 'escalated'.
 *
 * Design decisions:
 *   - **Persist-first / best-effort email**: `save()` runs before `sendEmail()`.
 *     On email failure we `console.error` and still return `{ submissionId }`.
 *     This mirrors how the contact-submissions route treats email failure as
 *     non-fatal to persistence (the human queue has the entry; alerts can
 *     be re-sent manually if needed).
 *   - **priority: 'high'**: an explicit human escalation from within the chat
 *     is higher-urgency than a cold contact form; the admin inbox reflects this.
 *   - **Dependency injection**: real I/O (connectDB + ContactSubmission + emailService)
 *     is wrapped in injectable `deps` so the test runs with zero Mongo/SendGrid
 *     involvement. Pattern mirrors `costGuard.ts`.
 *   - **ChatConversation is NOT touched here**: linking `escalatedSubmissionId` and
 *     setting conversation status to 'escalated' is ChatService's responsibility
 *     (Task 1.7). Keep this function single-purpose.
 *
 * Layering: this is a services-layer module. It may import from lib/ and models/,
 * but must NOT be imported by anything in app/api/** directly.
 */

import type { ChatActor } from "@/lib/support-chat/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Collected contact details from the widget (Task 1.9). */
export interface EscalationContact {
  /** Full name, if the widget collected it (members may prefill from session). */
  name?: string;
  /** Required — the widget must collect this before calling escalateToHuman. */
  email: string;
  /** Phone — widget should request this; falls back to "Not provided" if absent. */
  phone?: string;
}

/** Fields passed to the stub/real createSubmission dep. */
export interface SubmissionFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: "new";
  priority: "high";
  submittedAt: Date;
}

/** Return from createSubmission dep. */
export interface SubmissionResult {
  submissionId: string;
  submittedAt: string; // ISO string
}

/** Email payload passed to the sendEmail dep. */
export interface EscalationEmailPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: string; // ISO string
  submissionId: string;
}

/** Injectable deps — all default to the real production path. */
export interface EscalationDeps {
  createSubmission?: (fields: SubmissionFields) => Promise<SubmissionResult>;
  sendEmail?: (payload: EscalationEmailPayload) => Promise<{ success: boolean; error?: unknown }>;
}

// ─── Name splitting helper ────────────────────────────────────────────────────

/**
 * Splits a full name string into { firstName, lastName }.
 * Falls back to "Chat" / "User" when the name is absent or single-word.
 */
function splitName(name: string | undefined): { firstName: string; lastName: string } {
  if (!name || name.trim().length === 0) {
    return { firstName: "Chat", lastName: "User" };
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "User" };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

// ─── Default (real) deps ──────────────────────────────────────────────────────

/**
 * Real production path — connects to MongoDB, saves a ContactSubmission, and
 * fires the SendGrid notification. Loaded lazily so tests that inject stubs
 * never import Mongoose or the email service.
 */
async function _defaultCreateSubmission(fields: SubmissionFields): Promise<SubmissionResult> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: ContactSubmission } = await import("@/models/ContactSubmission");

  await connectDB();

  const doc = new ContactSubmission({
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    subject: fields.subject,
    message: fields.message,
    status: fields.status,
    priority: fields.priority,
    submittedAt: fields.submittedAt,
  });

  await doc.save();

  return {
    submissionId: String(doc._id),
    submittedAt: (doc.submittedAt as Date).toISOString(),
  };
}

async function _defaultSendEmail(
  payload: EscalationEmailPayload
): Promise<{ success: boolean; error?: unknown }> {
  const { emailService } = await import("@/lib/email/");
  return emailService.sendContactSubmissionEmail({
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    phone: payload.phone,
    subject: payload.subject,
    message: payload.message,
    submittedAt: payload.submittedAt,
    submissionId: payload.submissionId,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Escalates a support chat conversation to a human agent.
 *
 * Persist-first: the ContactSubmission is saved before the email is sent.
 * On email failure, `console.error` is called but `{ submissionId }` is still
 * returned — the human queue always has the entry.
 *
 * @param input.actor             — ChatActor (member or anonymous). Used to
 *                                  label the subject so staff see the origin.
 * @param input.contact           — Collected contact details from the widget.
 * @param input.transcriptSummary — AI-generated summary of the conversation,
 *                                  truncated to ≤2000 chars (ContactSubmission limit).
 * @param deps                    — Injectable for testing. Defaults to real DB + email.
 *
 * @returns `{ submissionId }` — the new ContactSubmission's `_id` as a string.
 *          ChatService (Task 1.7) should link this to the ChatConversation.
 */
export async function escalateToHuman(
  input: {
    actor: ChatActor;
    contact: EscalationContact;
    transcriptSummary: string;
  },
  deps?: EscalationDeps
): Promise<{ submissionId: string }> {
  const createSubmission = deps?.createSubmission ?? _defaultCreateSubmission;
  const sendEmail = deps?.sendEmail ?? _defaultSendEmail;

  const { actor, contact, transcriptSummary } = input;

  // ── Build submission fields ──────────────────────────────────────────────
  const { firstName, lastName } = splitName(contact.name);
  const phone = contact.phone && contact.phone.trim().length > 0 ? contact.phone.trim() : "Not provided";

  // Subject uses actor.kind so staff see "member" vs "anonymous" at a glance.
  const subject = `Support chat escalation (${actor.kind})`;

  // Truncate to ContactSubmission.message maxlength (2000 chars).
  const message = transcriptSummary.slice(0, 2000);

  const submittedAt = new Date();

  const fields: SubmissionFields = {
    firstName,
    lastName,
    email: contact.email,
    phone,
    subject,
    message,
    status: "new",
    priority: "high", // Explicit human request → high priority in the admin inbox.
    submittedAt,
  };

  // ── 1. Persist first ─────────────────────────────────────────────────────
  const { submissionId, submittedAt: savedAt } = await createSubmission(fields);

  // ── 2. Send email (best-effort) ──────────────────────────────────────────
  const emailResult = await sendEmail({
    firstName,
    lastName,
    email: contact.email,
    phone,
    subject,
    message,
    submittedAt: savedAt,
    submissionId,
  });

  if (!emailResult.success) {
    // Non-fatal: the submission exists in the human queue; staff can still find it.
    console.error(
      "[support-chat/escalation] Failed to send escalation email notification " +
        `(submissionId=${submissionId}):`,
      emailResult.error
    );
  }

  // ── 3. Return submissionId for ChatService to link ────────────────────────
  return { submissionId };
}
