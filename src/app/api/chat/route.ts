/**
 * /api/chat — streaming support-chat endpoint.
 *
 * THIN route handler (house rule): parse + validate → withChatbot (identify,
 * rate-limit, budget gate, audit scaffolding) → delegate to chatService.respond.
 * All orchestration lives in src/services/support-chat/ChatService.ts.
 *
 * Runtime:
 *   - nodejs: ChatService persists to Mongo (Mongoose is a server external) and
 *     the streamText call needs the Node runtime.
 *   - force-dynamic: every chat turn is unique; never cache.
 *   - vercel.json sets maxDuration: 60 for this route (added in Task 0.1).
 *
 * Validation (ChatRequestSchema):
 *   - messages: non-empty array (internal UIMessage shape is left to
 *     convertToModelMessages; we only guard the essentials + the input cap).
 *   - the last user message's combined text ≤ 2000 chars (hard input cap).
 *   - conversationId: optional string (≤64).
 *   - contact: optional { name?, email (valid email), phone? }.
 *   A thrown ZodError is mapped to a 400 by withChatbot.
 */

import { z } from "zod";
import { withChatbot } from "@/lib/support-chat/withChatbot";
import { chatService } from "@/services/support-chat/ChatService";
import type { UIMessage } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 2000;

// A loose message schema — convertToModelMessages handles the real UIMessage
// shape; we only need role + parts to extract the latest user text for the cap.
const MessagePartSchema = z
  .object({ type: z.string(), text: z.string().optional() })
  .passthrough();

const MessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(MessagePartSchema).optional(),
  })
  .passthrough();

const ContactSchema = z.object({
  name: z.string().max(200).optional(),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
});

/** Combined text of the last user message, used for the hard input cap. */
function lastUserTextLength(messages: z.infer<typeof MessageSchema>[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const text = (messages[i].parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");
    return text.length;
  }
  return 0;
}

const ChatRequestSchema = z
  .object({
    messages: z.array(MessageSchema).min(1),
    conversationId: z.string().max(64).optional(),
    contact: ContactSchema.optional(),
  })
  .refine((body) => lastUserTextLength(body.messages) <= MAX_INPUT_CHARS, {
    message: `Message exceeds the ${MAX_INPUT_CHARS}-character limit`,
    path: ["messages"],
  });

export const POST = withChatbot(async (ctx) => {
  const body = ChatRequestSchema.parse(await ctx.req.json());
  return chatService.respond({
    ctx,
    messages: body.messages as unknown as UIMessage[],
    conversationId: body.conversationId,
    contact: body.contact,
  });
});
