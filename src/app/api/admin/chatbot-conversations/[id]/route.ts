import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { handleApiError } from "@/lib/errors/handlers";
import { getChatTranscript } from "@/services/admin/chatTranscripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same gate as the list route — see the note there. */
const REQUIRED_PERMISSION = "submissions.view";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/chatbot-conversations/[id]
 *
 * Returns one full transcript: every stored message in order (content already
 * PII-redacted at write time), plus the per-request audit rows so an admin can
 * see model tier, latency, and token cost turn by turn.
 *
 * 404 when the id is unknown or the conversation has aged out of the 90-day TTL.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const guard = await requirePermission(REQUIRED_PERMISSION);
    if (guard instanceof NextResponse) return guard;

    const { id } = await params;
    const data = await getChatTranscript(id);

    if (!data) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Conversation not found or expired",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { data, meta: { timestamp: new Date().toISOString() } },
      { status: 200, headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
