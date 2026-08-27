import mongoose from "mongoose";
import { MilestoneService } from "@/services/milestones";

/**
 * Draw buckets this service may grant into.
 * - "streak"              — Membership Streak auto-grants
 * - "cancellation-upsell" — the 100-entry retention offer (added 2026-08-26)
 */
export type DrawGrantSourceKey = "bonus-entry-promo" | "streak" | "cancellation-upsell";

/**
 * The result of ONE grant attempt — THREE facts, never two.
 *
 * A caller that has already spent something on the customer's behalf (a
 * one-per-lifetime bonus code, a paid milestone, a one-time retention offer) has
 * to decide whether to REVERSE that spend, and reversing is only safe when the
 * entries are definitely NOT in the draw.
 *
 * This used to be a `boolean`, which collapsed two different facts into one:
 * "no draw was available, nothing was written" and "the write threw". They are
 * not the same. A mongoose `VersionError` is safe to reverse; a LOST
 * ACKNOWLEDGEMENT on a `save()` the server actually applied is not — the entries
 * are in the live draw, and reversing re-arms the code, so the customer's next
 * claim lands the same entries a SECOND time in a draw that decides who wins a
 * real prize. That is unwithdrawable; a claim left spent is not. Hence three:
 *
 * - "landed"      — the entries ARE in the draw. Keep the spend.
 * - "not_written" — verified that nothing reached the draw. Safe to reverse.
 * - "unconfirmed" — a write was attempted and cannot be proven either way.
 *                   DO NOT reverse. A stuck claim is admin-recoverable and is
 *                   logged with everything needed to recover it; a second grant
 *                   into a live draw is neither.
 *
 * Every path returns one of these — `grantMonthlyCouponEntries` does not throw.
 */
export type DrawGrantOutcome =
  | { status: "landed" }
  | { status: "not_written"; reason: string }
  | { status: "unconfirmed"; reason: string };

export class DrawGrantService {
  /**
   * After a failed `save()`, ask the database what actually happened.
   *
   * `expectedAtLeast` is this customer's PRE-MUTATION total in `sourceKey` plus
   * the amount we tried to add. That baseline is why the check can only be made
   * here: a caller re-reading afterwards cannot tell 200 already-held entries
   * from 200 just written.
   *
   * `>=`, not `===`: a concurrent grant into the same bucket for the same
   * customer would inflate the number, and being wrong in THAT direction leaves a
   * claim spent (recoverable by an admin) instead of granting twice (not
   * recoverable at all).
   *
   * @returns true = the write landed · false = it did not · null = cannot tell.
   */
  private static async verifyGrantLanded(params: {
    drawId: unknown;
    userId: string;
    sourceKey: DrawGrantSourceKey;
    expectedAtLeast: number;
  }): Promise<boolean | null> {
    try {
      const MajorDraw = (await import("@/models/MajorDraw")).default;
      const fresh = await MajorDraw.findById(params.drawId)
        .select("entries.userId entries.entriesBySource")
        .lean<{
          entries?: Array<{
            userId?: mongoose.Types.ObjectId;
            entriesBySource?: Partial<Record<DrawGrantSourceKey, number>>;
          }>;
        } | null>();
      if (!fresh) return null;
      const row = (fresh.entries ?? []).find((entry) => entry.userId?.toString() === params.userId);
      const current = row?.entriesBySource?.[params.sourceKey] ?? 0;
      return current >= params.expectedAtLeast;
    } catch {
      // The re-read itself failed — we know nothing more than we did before it.
      return null;
    }
  }

  /**
   * Grant `entries` into the target Major Draw under `sourceKey`.
   *
   * NEVER THROWS — see `DrawGrantOutcome`. A caller that has spent a paid
   * entitlement must reverse ONLY on `not_written`.
   */
  static async grantMonthlyCouponEntries(
    userId: string,
    entries: number,
    sourceKey: DrawGrantSourceKey = "bonus-entry-promo",
    opts: { skipMilestoneCheck?: boolean } = {}
  ): Promise<DrawGrantOutcome> {
    if (entries <= 0) return { status: "not_written", reason: "nothing_to_grant" };

    let activeMajorDraw;
    try {
      // The import sits inside the try on purpose: a module-load failure here is
      // still "nothing was written", which is the safe-to-reverse answer.
      const { getTargetMajorDraw } = await import("@/utils/draws/major-draw-helpers");
      activeMajorDraw = await getTargetMajorDraw();
    } catch (error) {
      console.warn("No target major draw available for coupon / milestone / streak entry grant", {
        userId,
        entries,
        sourceKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: "not_written", reason: "no_target_draw" };
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const existingEntry = activeMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    // Captured BEFORE the mutation below. After a failed save() this is the only
    // number that separates "the write never applied" from "the write applied and
    // only the acknowledgement was lost".
    const sourceTotalBefore = existingEntry ? existingEntry.entriesBySource[sourceKey] || 0 : 0;

    if (existingEntry) {
      existingEntry.totalEntries += entries;
      existingEntry.entriesBySource[sourceKey] = sourceTotalBefore + entries;
      existingEntry.lastUpdatedDate = now;
    } else {
      activeMajorDraw.entries.push({
        userId: userObjectId,
        totalEntries: entries,
        entriesBySource: {
          membership: 0,
          "one-time-package": 0,
          upsell: 0,
          "mini-draw": 0,
          referral: 0,
          "bonus-entry-promo": 0,
          "cancellation-upsell": 0,
          streak: 0,
          [sourceKey]: entries,
        },
        firstAddedDate: now,
        lastUpdatedDate: now,
      });
    }

    try {
      await activeMajorDraw.save();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);

      // A mongoose VersionError is a RECEIVED answer, not a lost one: the update
      // carried the document's __v, matched zero rows and modified nothing.
      // Definitively not written, so no re-read is needed.
      if (saveError instanceof Error && saveError.name === "VersionError") {
        console.error("[draw-grant] draw save lost a version race — nothing was written", {
          userId,
          entries,
          sourceKey,
        });
        return { status: "not_written", reason: `version_conflict: ${message}` };
      }

      const landed = await DrawGrantService.verifyGrantLanded({
        drawId: activeMajorDraw._id,
        userId,
        sourceKey,
        expectedAtLeast: sourceTotalBefore + entries,
      });

      if (landed === false) {
        console.error("[draw-grant] draw save failed — verified NOTHING reached the draw", {
          userId,
          entries,
          sourceKey,
          error: message,
        });
        return { status: "not_written", reason: `save_failed: ${message}` };
      }

      if (landed === null) {
        console.error(
          "[draw-grant] draw save failed AND could not be verified — the caller must NOT reverse; reconcile by hand:",
          { userId, entries, sourceKey, drawId: String(activeMajorDraw._id), error: message }
        );
        return { status: "unconfirmed", reason: `save_unverified: ${message}` };
      }

      // landed === true — the server applied the write and only the reply was
      // lost. Reversing here is the second-grant door this branch exists to shut.
      console.error("[draw-grant] draw save threw but the entries ARE in the draw — treating as landed", {
        userId,
        entries,
        sourceKey,
        error: message,
      });
    }

    // The streak auto-grant path passes skipMilestoneCheck to prevent re-entrancy
    // (grant → check → grant …). Streak entries are also excluded from the
    // entries-gained metric, so nothing is lost by skipping here.
    if (!opts.skipMilestoneCheck) {
      try {
        await MilestoneService.checkAndIssueMilestones(userId);
      } catch (error) {
        console.error("Failed to evaluate milestones after entry grant:", error);
      }
    }

    return { status: "landed" };
  }
}
