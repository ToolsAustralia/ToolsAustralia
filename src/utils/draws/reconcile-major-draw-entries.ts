/**
 * Reconcile (self-heal) membership renewals that failed to credit the active
 * MajorDraw.
 *
 * Safety net for the swallowed-`addToMajorDraw` failure mode (see
 * docs/payment/gotchas.md, docs/draws/gotchas.md). The hardened `addToMajorDraw`
 * now retries + reports, but if a credit still fails it leaves the renewal's
 * `data.grants.drawGrants` empty; this reconciler detects those and credits the
 * shortfall idempotently.
 *
 * AUTHORITATIVE BASIS: a member's correct draw membership = `data.entries` of
 * their LATEST in-window membership `BenefitsGranted` event (NOT
 * `subscription.lastMonthAccumulatedEntries`, which drifts ahead). A member is
 * healed only when: latest in-window membership grant has empty `drawGrants` +
 * subscription active + that renewal not refunded + live draw membership < grant.
 *
 * Idempotent: re-reads the live draw value immediately before writing and skips
 * anyone already correct, so repeated runs never double-credit.
 */

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";

export interface ReconcileMajorDrawResult {
  drawId: string | null;
  drawName: string | null;
  candidates: number; // members whose latest renewal had empty drawGrants & draw < grant
  healed: number;
  entriesCredited: number;
  skippedInactive: number;
  skippedRefunded: number;
  /** Non-membership (one-time/upsell) empty-drawGrants in window — alert signal, NOT auto-healed. */
  nonMembershipEmptyDrawGrants: number;
  errors: number;
}

type LeanGrantEvent = {
  _id: string;
  userId: mongoose.Types.ObjectId;
  paymentIntentId: string;
  timestamp: Date;
  data?: { entries?: number; grants?: { drawGrants?: Array<{ kind: string }> } };
};

const REFUND_EVENT_TYPES = ["RefundProcessed", "RefundPartial", "BenefitsReversed"];

export async function reconcileActiveMajorDrawEntries(opts?: {
  drawId?: string;
  limit?: number;
}): Promise<ReconcileMajorDrawResult> {
  await connectDB();
  const limit = opts?.limit ?? 500;

  const draw = opts?.drawId
    ? await MajorDraw.findById(opts.drawId)
    : await MajorDraw.findOne({ status: "active" }).sort({ activationDate: -1 });

  const empty: ReconcileMajorDrawResult = {
    drawId: null,
    drawName: null,
    candidates: 0,
    healed: 0,
    entriesCredited: 0,
    skippedInactive: 0,
    skippedRefunded: 0,
    nonMembershipEmptyDrawGrants: 0,
    errors: 0,
  };
  if (!draw) return empty;

  const drawId = String(draw._id);
  const activation = new Date(draw.activationDate);
  const result: ReconcileMajorDrawResult = { ...empty, drawId, drawName: draw.name };

  // Live membership per user.
  const liveMem = new Map<string, number>();
  const hasRow = new Set<string>();
  for (const r of draw.entries) {
    liveMem.set(r.userId.toString(), r.entriesBySource?.membership ?? 0);
    hasRow.add(r.userId.toString());
  }

  // Drift signal: non-membership empty-drawGrants in window (alert only).
  result.nonMembershipEmptyDrawGrants = await PaymentEvent.countDocuments({
    eventType: { $in: ["BenefitsGranted", "UpsellProcessed"] },
    packageType: { $in: ["one-time", "upsell"] },
    timestamp: { $gte: activation },
    "data.entries": { $gt: 0 },
    "data.grants.drawGrants": { $size: 0 },
  });

  // Latest in-window membership grant per user.
  const evs = (await PaymentEvent.find({
    eventType: "BenefitsGranted",
    packageType: "membership",
    timestamp: { $gte: activation },
  })
    .select("userId paymentIntentId timestamp data.entries data.grants.drawGrants")
    .sort({ timestamp: 1 })
    .lean()) as unknown as LeanGrantEvent[];

  const latestByUser = new Map<string, LeanGrantEvent>();
  for (const e of evs) latestByUser.set(e.userId.toString(), e);

  for (const [uid, ev] of latestByUser) {
    const dg = ev.data?.grants?.drawGrants ?? [];
    if (dg.length > 0) continue; // latest renewal credited fine
    const grant = ev.data?.entries ?? 0;
    const current = liveMem.get(uid) ?? 0;
    if (current >= grant) continue; // already correct (healed earlier / retried)

    result.candidates += 1;
    if (result.healed >= limit) continue; // bound work per run; next run continues

    const objId = new mongoose.Types.ObjectId(uid);
    try {
      const u = await User.findById(objId).select("subscription.isActive").lean<{ subscription?: { isActive?: boolean } }>();
      if (u?.subscription?.isActive !== true) {
        result.skippedInactive += 1;
        continue;
      }
      const refunded = await PaymentEvent.countDocuments({
        userId: objId,
        eventType: { $in: REFUND_EVENT_TYPES },
        paymentIntentId: ev.paymentIntentId,
      });
      if (refunded > 0) {
        result.skippedRefunded += 1;
        continue;
      }

      // Re-read live membership immediately before writing (idempotency).
      const fresh = await MajorDraw.findOne(
        { _id: draw._id, "entries.userId": objId },
        { "entries.$": 1 }
      ).lean<{ entries?: Array<{ entriesBySource?: { membership?: number } }> }>();
      const freshMem = fresh?.entries?.[0]?.entriesBySource?.membership ?? null;
      if (freshMem !== null && freshMem >= grant) continue; // already fixed

      const now = new Date();
      if (freshMem !== null) {
        const delta = grant - freshMem;
        await MajorDraw.updateOne(
          { _id: draw._id, "entries.userId": objId },
          {
            $inc: {
              "entries.$.totalEntries": delta,
              "entries.$.entriesBySource.membership": delta,
              totalEntries: delta,
            },
            $set: { "entries.$.lastUpdatedDate": now },
          }
        );
        result.entriesCredited += delta;
      } else {
        await MajorDraw.updateOne(
          { _id: draw._id, "entries.userId": { $ne: objId } },
          {
            $push: {
              entries: {
                userId: objId,
                totalEntries: grant,
                entriesBySource: {
                  membership: grant,
                  "one-time-package": 0,
                  upsell: 0,
                  "mini-draw": 0,
                  "bonus-entry-promo": 0,
                  referral: 0,
                  "cancellation-upsell": 0,
                },
                firstAddedDate: now,
                lastUpdatedDate: now,
              },
            },
            $inc: { totalEntries: grant },
          }
        );
        result.entriesCredited += grant;
      }

      // Back-fill the ledger so refund-reversal can attribute it later.
      await PaymentEvent.updateOne(
        { _id: ev._id, "data.grants.drawGrants": { $size: 0 } },
        { $push: { "data.grants.drawGrants": { kind: "major", drawId, sourceKey: "membership", entries: grant } } }
      );

      result.healed += 1;
    } catch (err) {
      result.errors += 1;
      console.error(`[reconcile-major-draw-entries] heal failed for user ${uid}:`, err instanceof Error ? err.message : err);
    }
  }

  return result;
}
