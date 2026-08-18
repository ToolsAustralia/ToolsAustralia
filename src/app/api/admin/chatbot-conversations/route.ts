import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { handleApiError } from "@/lib/errors/handlers";
import {
  listChatTranscripts,
  MESSAGE_TTL_DAYS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
} from "@/services/admin/chatTranscripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transcripts are gated behind `submissions.view`, NOT the `overview.view` that
 * guards the sibling chatbot-cost route. Cost analytics is aggregate numbers;
 * this endpoint returns what individual customers typed. `submissions.view` is
 * already the support-facing permission (contact submissions — which is exactly
 * where an escalated Cobber chat lands), so it is the right existing gate.
 */
const REQUIRED_PERMISSION = "submissions.view";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(MESSAGE_TTL_DAYS).default(30),
  status: z.enum(["all", "open", "escalated", "closed"]).default("all"),
  actor: z.enum(["all", "member", "anonymous"]).default("all"),
  kind: z.enum(["all", "deflected", "generative"]).default("all"),
  q: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

/**
 * GET /api/admin/chatbot-conversations
 *
 * Lists Cobber conversations newest-first for the admin transcript browser.
 * Filters: ?days= ?status= ?actor= ?kind= ?q= ?page= ?limit=
 * Message content is redacted at write time, so no raw PII is returned;
 * customer identity is limited to firstName + opaque userId.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission(REQUIRED_PERMISSION);
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid query parameters",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const data = await listChatTranscripts(parsed.data);

    return NextResponse.json(
      { data, meta: { timestamp: new Date().toISOString() } },
      {
        status: 200,
        // Private + short: transcripts are staff-only and new chats land often.
        headers: { "Cache-Control": "private, max-age=30" },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
