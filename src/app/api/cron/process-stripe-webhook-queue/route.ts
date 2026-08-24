import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { computeNextAttempt } from "@/services/stripe-webhook-queue/backoff";
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";

const SWEEP_BATCH_SIZE = 20;
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
            // TTL anchor. `dead_processedAt_ttl` is a partial index on
            // processedAt, and MongoDB TTL skips non-date values — so a dead row
            // left with processedAt:null NEVER expires. markFailed's dead branch
            // sets this; this branch used not to, which made orphan-swept rows
            // immortal and (since /api/cron/reconcile-renewal-grants reports
            // every dead row, un-windowed) a permanent daily alert.
            processedAt: new Date(),
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

  await Promise.allSettled(
    dueRows.map((row) => processQueuedEvent(row.eventId))
  );

  return NextResponse.json({
    orphansRecovered: orphans.length,
    dispatched: dueRows.length,
  });
}
