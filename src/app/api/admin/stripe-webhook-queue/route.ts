import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueStatus } from "@/models/StripeWebhookQueue";

const ALLOWED_STATUSES: ReadonlyArray<StripeWebhookQueueStatus> = [
  "queued",
  "processing",
  "succeeded",
  "dead",
];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") return null;
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Immediate fan-out so the engineer doesn't wait up to 60s for the sweeper.
  const workerSecret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  void fetch(`${baseUrl}/api/stripe/process-event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": workerSecret ?? "",
    },
    body: JSON.stringify({ eventId: row.eventId }),
  }).catch((err) => console.error("[webhook-replay] fan-out POST failed:", err));

  return NextResponse.json({ replayed: true, eventId: row.eventId });
}
