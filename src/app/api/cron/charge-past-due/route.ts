import { NextResponse } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import ChargeJobRun from "@/models/ChargeJobRun";
import {
  ChargeJobLockedError,
  ChargeJobWorklistTooLargeError,
  processChargePastDueChunk,
  startChargePastDueJob,
  sweepOrphanRuns,
  type ChargePacing,
} from "@/server/admin/chargePastDueJob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const TZ = "Australia/Sydney";
/** Hours after the start hour during which a missed run may still begin. */
const START_WINDOW_HOURS = 2;

/**
 * Automated daily past-due charge run.
 *
 * WHY SEPARATE FROM THE ADMIN BUTTON
 * The admin run is human-supervised and keeps its fast pacing (15 parallel).
 * This one carries the DAILY volume, and daily volume at that burst rate is what
 * generates Stripe's excessive-retry blocks (docs/billing-stripe/gotchas.md), so
 * it runs strictly sequential with a delay between charges.
 *
 * SCHEDULING — Vercel crons are UTC ONLY and Sydney shifts between UTC+10 and
 * UTC+11. Rather than hard-code UTC hours, this fires every 5 minutes and
 * resolves the real Sydney local hour itself: DST needs no maintenance, no
 * second cron entry, and the start hour is freely configurable.
 *
 * TICK MODEL — Vercel caps the function at 300s, so a run is never one long
 * process: each invocation works until its deadline and exits, and the next tick
 * resumes from `worklist - already-logged rows`.
 */
export async function GET(request: Request) {
  // 1. AUTH — mandatory. This is the only cron that moves money, so a missing
  //    secret must FAIL CLOSED rather than leave the endpoint open.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. KILL SWITCH — opt-in, so merging this changes nothing until it is set.
  if (process.env.CHARGE_CRON_ENABLED !== "true") {
    return NextResponse.json({ skipped: "disabled" });
  }

  const adminId = process.env.CHARGE_CRON_ADMIN_USER_ID;
  if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
    console.error("[charge-cron] CHARGE_CRON_ADMIN_USER_ID missing/invalid — refusing to run");
    return NextResponse.json({ skipped: "no_admin_id" });
  }

  // 3. CONFIG — a bad value must be loud, not a silent daily no-op.
  const rawStartHour = process.env.CHARGE_CRON_START_HOUR ?? "7";
  const startHour = Number(rawStartHour);
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    console.error(
      `[charge-cron] CHARGE_CRON_START_HOUR must be an integer 0-23, got "${rawStartHour}" — refusing to run`
    );
    return NextResponse.json({ skipped: "bad_start_hour" }, { status: 500 });
  }

  await connectDB();

  const now = new Date();
  const localHour = Number(formatInTimeZone(now, TZ, "H"));
  const localDate = formatInTimeZone(now, TZ, "yyyy-MM-dd");

  const pacing: ChargePacing = {
    // Sequential. Concurrency is the burst Stripe objects to; the delay only
    // tunes the sustained rate that remains.
    concurrency: 1,
    delayMs: Number(process.env.CHARGE_CRON_DELAY_MS ?? "2000"),
  };

  try {
    // 4. AGE OUT ABANDONED RUNS FIRST.
    //    sweepOrphanRuns normally only runs inside startChargePastDueJob, which
    //    is unreachable while ANY run is `running`. Without this, an admin run
    //    left `running` by a closed browser tab disables the cron indefinitely
    //    while every tick still returns HTTP 200.
    await sweepOrphanRuns();

    // 5. RESUME BEFORE START — never start a second run alongside a live one.
    const running = await ChargeJobRun.findOne({ kind: "charge", status: "running" })
      .select("_id trigger startedAt")
      .lean<{ _id: mongoose.Types.ObjectId; trigger?: string; startedAt: Date }>();

    if (running) {
      if ((running.trigger ?? "admin") !== "cron") {
        // An admin owns this one. Stand down — but make it VISIBLE, because a
        // silent skip here means the day collected nothing.
        console.error(
          `[charge-cron] standing down: admin run ${String(running._id)} still running (started ${running.startedAt?.toISOString()}). No automated collection this tick.`
        );
        return NextResponse.json({ skipped: "admin_run_in_progress" });
      }
      const result = await drainWithinBudget(String(running._id), adminId, pacing);
      return NextResponse.json({ resumed: String(running._id), ...result });
    }

    // 6. START WINDOW — a window, not a single hour, so a day whose previous run
    //    overran still gets one. The per-day guard below prevents a second start.
    if (localHour < startHour || localHour > startHour + START_WINDOW_HOURS) {
      return NextResponse.json({ skipped: "outside_start_window", localHour, startHour });
    }

    // 7. ONE RUN PER LOCAL DAY.
    //    fromZonedTime, NOT new Date(): a bare "YYYY-MM-DDT00:00:00" is parsed in
    //    the SERVER's timezone (UTC on Vercel), which would put the start of the
    //    Sydney day hours in the FUTURE and make this guard never fire.
    const startOfLocalDay = fromZonedTime(`${localDate}T00:00:00`, TZ);
    const already = await ChargeJobRun.countDocuments({
      kind: "charge",
      trigger: "cron",
      startedAt: { $gte: startOfLocalDay },
    });
    if (already > 0) {
      return NextResponse.json({ skipped: "already_ran_today", localDate });
    }

    // 8. START — the ceiling is enforced INSIDE the lock, before any run or
    //    worklist document exists, so an anomalous day leaves no state behind.
    const start = await startChargePastDueJob({
      adminId,
      trigger: "cron",
      maxWorklist: Number(process.env.CHARGE_CRON_MAX_WORKLIST ?? "3000"),
    });

    if (start.done) {
      return NextResponse.json({ runId: start.runId, total: start.total, done: true });
    }

    const result = await drainWithinBudget(start.runId, adminId, pacing);
    return NextResponse.json({ started: start.runId, total: start.total, ...result });
  } catch (err) {
    if (err instanceof ChargeJobWorklistTooLargeError) {
      console.error(
        `[charge-cron] HALTED: worklist ${err.total} exceeds ceiling ${err.ceiling}. No charges made, no run created.`
      );
      return NextResponse.json({ halted: "worklist_above_ceiling", total: err.total });
    }
    // Another invocation took the lock between our check and the start. Normal
    // under concurrency — retry next tick rather than treating it as an error.
    if (err instanceof ChargeJobLockedError) {
      return NextResponse.json({ skipped: "locked" });
    }
    console.error("[charge-cron] run failed:", err);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}

/**
 * Charge until the invocation's deadline, then hand back.
 *
 * The deadline is passed INTO the chunk and enforced per item, because a chunk's
 * cost is dominated by Stripe round-trips rather than by our own sleep — so the
 * caller cannot predict it up front. Every item writes its own log row before
 * the next begins, so stopping mid-chunk is safe and fully resumable.
 */
async function drainWithinBudget(
  runId: string,
  adminId: string,
  pacing: ChargePacing
): Promise<{ processed: number; done: boolean; chunks: number }> {
  const budgetMs = Number(process.env.CHARGE_CRON_BUDGET_MS ?? "240000");
  const deadlineAt = Date.now() + budgetMs;

  let processed = 0;
  let done = false;
  let chunks = 0;

  while (Date.now() < deadlineAt) {
    const res = await processChargePastDueChunk({
      runId,
      adminId,
      chunkSize: 30,
      pacing,
      deadlineAt,
    });
    processed = res.processed;
    chunks += 1;
    if (res.done) {
      done = true;
      break;
    }
    // Nothing advanced this chunk (deadline hit immediately, or every item is
    // unloggable) — hand back rather than spin.
    if (res.processedThisChunk === 0) break;
  }
  return { processed, done, chunks };
}
