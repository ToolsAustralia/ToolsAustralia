import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueStatus } from "@/models/StripeWebhookQueue";
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";

const ALLOWED_STATUSES: ReadonlyArray<StripeWebhookQueueStatus> = [
  "queued",
  "processing",
  "succeeded",
  "dead",
];

export async function GET(request: NextRequest) {
  const _guard = await requirePermission("errorReports.view");
  if (_guard instanceof NextResponse) return _guard;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  const filter: Record<string, unknown> = {};
  if (statusParam && (ALLOWED_STATUSES as ReadonlyArray<string>).includes(statusParam)) {
    filter.status = statusParam;
  }

  const [rows, total] = await Promise.all([
    StripeWebhookQueue.find(filter)
      .sort({ enqueuedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("eventId type status attempts nextAttemptAt claimedAt lastError enqueuedAt processedAt")
      .lean(),
    StripeWebhookQueue.countDocuments(filter),
  ]);

  return NextResponse.json({ rows, total, limit, skip });
}

export async function POST(request: NextRequest) {
  const _guard = await requirePermission("errorReports.edit");
  if (_guard instanceof NextResponse) return _guard;

  let body: { _id?: string };
  try {
    body = (await request.json()) as { _id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body._id || !mongoose.isValidObjectId(body._id)) {
    return NextResponse.json({ error: "Invalid _id" }, { status: 400 });
  }

  await connectDB();
  const row = await StripeWebhookQueue.findById(body._id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  row.status = "queued";
  row.nextAttemptAt = new Date();
  row.claimedAt = null;
  row.lastError = null;
  // Intentionally do NOT reset attempts — preserves the audit trail of how
  // many times this event has failed previously.
  await row.save();

  // Process immediately in-process so the admin sees the result now.
  const result = await processQueuedEvent(row.eventId);

  return NextResponse.json({ replayed: true, eventId: row.eventId, result });
}
