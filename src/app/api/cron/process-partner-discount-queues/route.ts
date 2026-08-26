/**
 * Partner Discount Queue Processing Cron Job
 *
 * Runs daily (`45 18 * * *` UTC — moved off `0 15 * * *` on 2026-08-24 to clear the
 * ~900-membership renewal-webhook-burst hour's trailing payment wave; see
 * docs/infrastructure/gotchas.md) to sweep every user's partner-discount queue:
 *  1. expire finished periods, 2. activate the next queued item,
 *  3. reconcile membership vs one-time tiers, 4. prune old expired rows.
 *
 * ⚠️ IMPORTANT: Vercel Cron triggers this path with a **GET** request, so the processing
 * MUST live in GET. This route previously did all its work in POST with GET as a no-op
 * health check — meaning the scheduled cron never actually processed anything, and queues
 * only advanced when a member opened the rewards page (GET /api/partner-discount/queue).
 * That is what let a finished one-time window sit unswept for weeks. POST is kept as a
 * manual-trigger alias. Pattern mirrors src/app/api/cron/reconcile-affiliate-commissions.
 *
 * @version 2.0.0
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import { processPartnerDiscountQueue } from "@/utils/partner-discounts/partner-discount-queue";
import { waitForPoolCapacity } from "@/utils/database/connection-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron requests when the env var
 *  is set. Allow when unset (local dev), matching sibling crons (reconcile-affiliate-commissions). */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

interface QueueProcessingSummary {
  processedCount: number;
  changedCount: number;
  errorCount: number;
  duration: string;
  errors?: { userId: string; email: string; error: string }[];
}

/** Sweep all users that have a non-empty partner discount queue. */
async function processAllPartnerDiscountQueues(): Promise<QueueProcessingSummary> {
  const startTime = Date.now();

  await connectDB();

  // Wait for pool capacity before starting the bulk operation.
  const hasCapacity = await waitForPoolCapacity(80, 10000);
  if (!hasCapacity) {
    console.warn("⚠️ Connection pool still near capacity after wait, proceeding anyway");
  }

  // Fetch users in batches (not .lean() — we need to call .save() on documents).
  const BATCH_SIZE = 200;
  let skip = 0;
  let hasMore = true;
  const allUsers: IUser[] = [];

  while (hasMore) {
    const batch = await User.find({
      partnerDiscountQueue: { $exists: true, $ne: [] },
    })
      .skip(skip)
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    allUsers.push(...batch);
    skip += BATCH_SIZE;

    if (batch.length < BATCH_SIZE) hasMore = false;

    // Small delay between batches to reduce connection pressure.
    if (hasMore) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  let processedCount = 0;
  let changedCount = 0;
  let errorCount = 0;
  const errors: { userId: string; email: string; error: string }[] = [];

  for (const user of allUsers) {
    try {
      const queueChanged = await processPartnerDiscountQueue(user);
      if (queueChanged) {
        await user.save();
        changedCount++;
      }
      processedCount++;
    } catch (error) {
      errorCount++;
      errors.push({
        userId: user._id.toString(),
        email: user.email,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.error(`❌ Error processing partner discount queue for user ${user.email}:`, error);
    }
  }

  return {
    processedCount,
    changedCount,
    errorCount,
    duration: `${Date.now() - startTime}ms`,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  };
}

function summaryResponse(data: QueueProcessingSummary) {
  return NextResponse.json({
    success: true,
    data,
    message: `Processed ${data.processedCount} users in ${data.duration}. ${data.changedCount} queues updated.`,
  });
}

function failureResponse(error: unknown) {
  console.error("❌ Partner discount queue cron failed:", error);
  return NextResponse.json(
    {
      success: false,
      error: "Cron job failed",
      message: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 }
  );
}

/**
 * GET /api/cron/process-partner-discount-queues
 * The entry point Vercel Cron actually invokes (daily at 3:00 PM UTC).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return summaryResponse(await processAllPartnerDiscountQueues());
  } catch (error) {
    return failureResponse(error);
  }
}

/**
 * POST /api/cron/process-partner-discount-queues
 * Manual-trigger alias (ops/testing) — runs the same sweep as the GET cron entry.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return summaryResponse(await processAllPartnerDiscountQueues());
  } catch (error) {
    return failureResponse(error);
  }
}
