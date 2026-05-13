import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { computeNextAttempt } from "@/services/stripe-webhook-queue/backoff";

const SWEEP_BATCH_SIZE = 20;
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const now = new Date();
  const orphanCutoff = new Date(now.getTime() - ORPHAN_THRESHOLD_MS);

  // 1. Recover orphans: rows stuck in `processing` past the threshold get
  //    rolled back to `queued` with an incremented attempt count.
  const orphans = await StripeWebhookQueue.find({
    status: "processing",
    claimedAt: { $lt: orphanCutoff },
  })
    .limit(SWEEP_BATCH_SIZE)
    .lean();

  for (const orphan of orphans) {
    const nextAttempts = (orphan.attempts ?? 0) + 1;
    const decision = computeNextAttempt(nextAttempts, now);
    if (decision === "dead") {
      await StripeWebhookQueue.updateOne(
        { _id: orphan._id, status: "processing" },
        {
          $set: {
            status: "dead",
            attempts: nextAttempts,
            lastError: "orphan: worker did not complete within threshold",
            claimedAt: null,
          },
        }
      );
    } else {
      await StripeWebhookQueue.updateOne(
        { _id: orphan._id, status: "processing" },
        {
          $set: {
            status: "queued",
            attempts: nextAttempts,
            nextAttemptAt: decision,
            lastError: "orphan: worker did not complete within threshold",
            claimedAt: null,
          },
        }
      );
    }
  }

  // 2. Dispatch queued rows whose nextAttemptAt has elapsed.
  const dueRows = await StripeWebhookQueue.find({
    status: "queued",
    nextAttemptAt: { $lte: now },
  })
    .limit(SWEEP_BATCH_SIZE)
    .lean();

  const workerSecret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  const workerUrl = `${getBaseUrl()}/api/stripe/process-event`;

  for (const row of dueRows) {
    void fetch(workerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": workerSecret ?? "",
      },
      body: JSON.stringify({ eventId: row.eventId }),
    }).catch((err) => {
      console.error("[webhook-sweeper] fan-out POST failed:", err);
    });
  }

  return NextResponse.json({
    orphansRecovered: orphans.length,
    dispatched: dueRows.length,
  });
}
