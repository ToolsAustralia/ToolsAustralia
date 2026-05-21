import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueStatus } from "@/models/StripeWebhookQueue";
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";
import {
  STRIPE_WEBHOOK_QUEUE_STATUSES,
  listStripeWebhookQueue,
} from "@/services/stripe-webhook-queue/listQueue";

export async function GET(request: NextRequest) {
  const _guard = await requirePermission("errorReports.view");
  if (_guard instanceof NextResponse) return _guard;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const limitParam = Number(searchParams.get("limit") ?? 50);
  const skipParam = Number(searchParams.get("skip") ?? 0);

  const status =
    statusParam &&
    (STRIPE_WEBHOOK_QUEUE_STATUSES as ReadonlyArray<string>).includes(statusParam)
      ? (statusParam as StripeWebhookQueueStatus)
      : null;

  const result = await listStripeWebhookQueue({
    status,
    limit: limitParam,
    skip: skipParam,
  });

  return NextResponse.json(result);
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
