import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import { previewChargePastDueInvoices } from "@/services/admin/previewChargePastDueInvoices";
import {
  ChargeJobLockedError,
  abortChargePastDueJob,
  processChargePastDueChunk,
  startChargePastDueJob,
} from "@/server/admin/chargePastDueJob";

/**
 * GET /api/admin/invoices/charge-past-due
 * Preview eligible invoices/users that will be charged (no actual charging).
 */
export async function GET(_request: NextRequest) {
  try {
    const _guard = await requirePermissionWithAudit("users.view", _request);
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();
    const preview = await previewChargePastDueInvoices();

    return NextResponse.json({ success: true, preview });
  } catch (error) {
    console.error("Error fetching preview:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch preview",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/invoices/charge-past-due
 *
 * CHUNKED bulk charge — the run is split across many short requests so it never
 * hits the Vercel timeout (the legacy single-shot loop did all ~800 charges in
 * one request and overran 300s). Two actions:
 *
 *   { action: "start", confirmation: "CHARGE" }
 *     → acquires the lock, snapshots the eligible worklist (no charging),
 *       creates the run. Returns { runId, total, done }.
 *
 *   { action: "chunk", runId, chunkSize? }
 *     → charges the next batch of worklist invoices, renews the lock, updates
 *       live totals; finalizes + releases the lock when drained.
 *       Returns { runId, total, processed, processedThisChunk, done, totals }.
 *
 * The client drives the loop (start → chunk → chunk … until done), so progress
 * is visible live and a closed tab leaves a resumable run (the 6h recent-attempt
 * guard makes a re-run continue safely).
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("users.charge", request);
    if (guard instanceof NextResponse) return guard;

    const { session, log } = guard;
    await connectDB();
    const adminId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const action: "start" | "chunk" | "abort" =
      body.action === "chunk" ? "chunk" : body.action === "abort" ? "abort" : "start";

    if (action === "start") {
      if (body.confirmation !== "CHARGE") {
        await log(400);
        return NextResponse.json(
          { error: "Invalid confirmation", message: 'You must type "CHARGE" to confirm this action.' },
          { status: 400 }
        );
      }

      try {
        const result = await startChargePastDueJob({ adminId });
        await log(200);
        return NextResponse.json({ success: true, ...result });
      } catch (err) {
        if (err instanceof ChargeJobLockedError) {
          await log(409);
          return NextResponse.json(
            {
              error: "Operation in progress",
              message: "Another bulk charge/recover is currently running. Please try again later.",
            },
            { status: 409 }
          );
        }
        throw err;
      }
    }

    // action === "chunk" | "abort"
    if (typeof body.runId !== "string" || !body.runId) {
      await log(400);
      return NextResponse.json(
        { error: "Missing runId", message: "A chunk/abort request must include the runId returned by start." },
        { status: 400 }
      );
    }

    const result =
      action === "abort"
        ? await abortChargePastDueJob({ runId: body.runId, adminId })
        : await processChargePastDueChunk({
            runId: body.runId,
            adminId,
            chunkSize: typeof body.chunkSize === "number" ? body.chunkSize : undefined,
          });
    await log(200);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error in charge-past-due route:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process charges",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
