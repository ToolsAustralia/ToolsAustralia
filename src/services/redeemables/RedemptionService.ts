import mongoose from "mongoose";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import MilestoneReward from "@/models/MilestoneReward";
import User from "@/models/User";
import { hasQualifyingPurchase } from "@/utils/redeemables/purchase-eligibility";
import { isCampaignRedeemable, personalWindowGoverns } from "@/utils/redeemables/bonus-code-policy";
import { DrawGrantService, type DrawGrantOutcome } from "./DrawGrantService";

export type RedemptionFailureReason =
  | "unauthorized"
  | "campaign_not_found"
  | "campaign_not_active"
  | "invalid_code"
  | "already_redeemed"
  | "expired"
  | "ineligible"
  | "concurrency_conflict"
  /**
   * The claim was valid and was NOT spent — but no Major Draw was available to
   * receive the entries (freeze window with nothing queued, or a draw write that
   * VERIFIABLY did not land). Everything this call wrote has been reversed: the
   * issuance is back to `active`, `redeemedEverAt` is gone if this call is what
   * wrote it, the wallet counter and the redemptionHistory row are undone. The
   * customer still holds their one-per-lifetime grant and can claim again later.
   */
  | "grant_unavailable"
  /**
   * The claim IS spent and this call could not safely hand it back. Two ways in,
   * and neither may be reversed automatically:
   *
   *   - the draw write could not be proven either way (a lost acknowledgement on
   *     a `save()` the server may have applied). Reversing would re-arm the code
   *     over entries that may already be in the live draw — a SECOND grant, and
   *     entries in a draw cannot be quietly withdrawn; or
   *   - the compensation itself failed, so the issuance is still `redeemed`.
   *
   * Distinct from `grant_unavailable` because that reason promises the grant is
   * still held, and here it may not be. Every occurrence is logged with the ids
   * needed to reconcile by hand. This is the deliberate trade: a stuck claim an
   * admin can fix, never a double grant nobody can undo.
   */
  | "grant_unresolved";

export interface RedemptionResult {
  success: boolean;
  reason?: RedemptionFailureReason;
  entriesGranted?: number;
  issuanceId?: string;
  /** Set when redemption succeeds — used for refund ledger / unredeem. */
  redemptionKind?: "monthly-coupon" | "milestone";
  /**
   * Set only when `reason === "expired"` — the ACTUAL expiresAt of the issuance
   * this call matched (RedeemableIssuance or MilestoneIssuance), so a caller can
   * name the real date without re-deriving it. This service already does the
   * issuance-identification work (issuanceId, then code as a personal issuance
   * code / campaign code / milestone reward code) before it can decide
   * "expired" — surfacing the matched value here means no caller ever needs
   * its own copy of that lookup. Optional so no existing caller breaks.
   */
  expiresAt?: Date;
}

export class RedemptionService {
  /**
   * Land a claim's entries in a draw, or undo the whole claim.
   *
   * WHY BURN-THEN-COMPENSATE, NOT GRANT-THEN-BURN. The sibling
   * `/api/cancellation-upsell/redeem` route grants first because its "already
   * redeemed?" check is a plain read with no atomicity to lose. A claim here is
   * different: the `findOneAndUpdate(status: "active" → "redeemed")` above is the
   * ONLY thing standing between two concurrent POSTs and a DOUBLE grant of a
   * money-equivalent code (two 200-entry grants into the live draw for one
   * BACKIN200). Granting before that gate would trade a rare "told you it landed
   * when it didn't" for a rare "landed twice" — strictly worse, because entries
   * already in a draw decide who wins and cannot be quietly withdrawn.
   *
   * So the gate stays first and this compensates instead. It is the same shape as
   * `autoRedeemMilestoneIssuance` below, which was fixed this way for exactly this
   * failure mode. Reversal is safe precisely because the draw write is the step
   * that did NOT happen.
   *
   * Order matters: revert the wallet FIRST, and re-open the issuance only if that
   * revert succeeded — re-opening while the counter still holds the `$inc` would
   * let the next claim double-count it.
   *
   * REVERSE ONLY WHAT IS PROVABLY UNWRITTEN. This used to reverse on a `false`
   * return AND on a throw, as if they were the same fact. They are not: `false`
   * meant no draw was ever touched, but a throw could come from
   * `activeMajorDraw.save()` — AFTER the entries had been added to the document.
   * A lost acknowledgement on a save the server actually applied would then leave
   * the entries in the live draw AND hand the code back, so the next claim landed
   * the same 200 entries a second time. `DrawGrantService` now answers with three
   * states instead of a boolean, and only `not_written` is reversed here.
   *
   * @returns "landed"     — the entries are in a draw, the claim stands.
   *          "reversed"   — nothing was granted and the whole claim was undone;
   *                         the customer still holds their grant.
   *          "unresolved" — the claim is spent and could NOT be safely handed
   *                         back. Logged loudly; needs a human.
   */
  private static async landEntriesOrCompensate(params: {
    userId: string;
    entriesAmount: number;
    redemptionId: string;
    reopenIssuance: () => Promise<unknown>;
    logContext: Record<string, string>;
  }): Promise<"landed" | "reversed" | "unresolved"> {
    const { userId, entriesAmount, redemptionId, reopenIssuance, logContext } = params;

    let outcome: DrawGrantOutcome;
    try {
      outcome = await DrawGrantService.grantMonthlyCouponEntries(userId, entriesAmount);
    } catch (e) {
      // `grantMonthlyCouponEntries` is total by contract. An escape means we do
      // not know what it wrote, which is exactly the case that must NOT reverse.
      outcome = { status: "unconfirmed", reason: e instanceof Error ? e.message : String(e) };
    }
    if (outcome.status === "landed") return "landed";

    const reason = outcome.reason;

    if (outcome.status === "unconfirmed") {
      // NOTHING is undone here. The entries may already be in the draw, and
      // handing the code back over them is the double-grant this branch exists to
      // prevent. The customer keeps the wallet counter and history row that match
      // a successful claim; if the draw write really was lost, this log is how it
      // gets reconciled.
      console.error("[redeemables] CLAIM WRITE UNCONFIRMED — nothing reversed, claim left spent, reconcile by hand:", {
        ...logContext,
        userId,
        entriesAmount,
        redemptionId,
        reason,
      });
      return "unresolved";
    }

    let walletReverted = false;
    try {
      await User.updateOne(
        { _id: userId },
        { $inc: { accumulatedEntries: -entriesAmount }, $pull: { redemptionHistory: { redemptionId } } }
      );
      walletReverted = true;
    } catch (revertErr) {
      // console.error, never warn: production builds strip warn, and hiding this
      // behind a stripped level is exactly how the original defect stayed invisible.
      console.error("[redeemables] CLAIM COMPENSATION FAILED (wallet revert) — claim left spent:", {
        ...logContext,
        userId,
        entriesAmount,
        redemptionId,
        reason,
        revertErr,
      });
    }

    let reopened = false;
    if (walletReverted) {
      reopened = await reopenIssuance()
        .then(() => true)
        .catch((revertErr) => {
          console.error("[redeemables] CLAIM COMPENSATION FAILED (issuance re-open) — claim left spent:", {
            ...logContext,
            userId,
            revertErr,
          });
          return false;
        });
    }

    console.error("[redeemables] CLAIM DID NOT LAND — no entries granted:", {
      ...logContext,
      userId,
      entriesAmount,
      reason,
      walletReverted,
      reopened,
    });

    // `grant_unavailable` promises the customer their code is still theirs. That
    // is only true once the issuance is actually back to `active` — a half-done
    // compensation must not borrow the reassuring answer.
    return reopened ? "reversed" : "unresolved";
  }

  /**
   * The wallet write threw. Hand the grant back — without letting a LOST
   * ACKNOWLEDGEMENT on that same write leave a phantom `$inc` behind.
   *
   * A throw is not proof the write did not apply, and this runs on the one path
   * where the issuance is ALREADY flipped to `redeemed` with `redeemedEverAt`
   * stamped: leaving it there burns a one-per-lifetime grant for a customer who
   * received nothing. So the grant goes back — but the `redemptionId` history row
   * is the marker that says whether the counter moved, so we ask before undoing.
   * Re-opening while the counter still holds the `$inc` is how the next claim
   * double-counts it.
   *
   * When we cannot tell, we re-open anyway: NOTHING has reached a draw at this
   * point, so the worst case is a counter an admin can correct — never entries in
   * a draw that cannot be withdrawn.
   *
   * @returns true when the issuance is back to `active` (the grant is held).
   */
  private static async reopenAfterWalletFailure(params: {
    userId: string;
    entriesAmount: number;
    redemptionId: string;
    reopenIssuance: () => Promise<unknown>;
    walletErr: unknown;
    logContext: Record<string, string>;
  }): Promise<boolean> {
    const { userId, entriesAmount, redemptionId, reopenIssuance, walletErr, logContext } = params;

    let walletApplied = false;
    try {
      walletApplied = Boolean(
        await User.exists({ _id: userId, "redemptionHistory.redemptionId": redemptionId })
      );
    } catch {
      // Cannot tell — fall through as "not applied" and re-open below.
    }

    let safeToReopen = true;
    if (walletApplied) {
      safeToReopen = false;
      try {
        await User.updateOne(
          { _id: userId },
          { $inc: { accumulatedEntries: -entriesAmount }, $pull: { redemptionHistory: { redemptionId } } }
        );
        safeToReopen = true;
      } catch (revertErr) {
        console.error("[redeemables] WALLET WRITE LANDED THEN FAILED TO REVERT — claim left spent:", {
          ...logContext,
          userId,
          entriesAmount,
          redemptionId,
          revertErr,
        });
      }
    }

    let reopened = false;
    if (safeToReopen) {
      reopened = await reopenIssuance()
        .then(() => true)
        .catch((revertErr) => {
          console.error("[redeemables] CLAIM COMPENSATION FAILED (issuance re-open) — claim left spent:", {
            ...logContext,
            userId,
            revertErr,
          });
          return false;
        });
    }

    console.error("[redeemables] CLAIM WALLET WRITE FAILED — no entries granted:", {
      ...logContext,
      userId,
      entriesAmount,
      redemptionId,
      walletApplied,
      reopened,
      walletErr,
    });

    return reopened;
  }

  static async redeem(params: {
    userId: string;
    code?: string;
    issuanceId?: string;
  }): Promise<RedemptionResult> {
    if (!mongoose.Types.ObjectId.isValid(params.userId)) {
      return { success: false, reason: "unauthorized" };
    }

    const user = await User.findById(params.userId).select("_id isActive subscription isEmailVerified accumulatedEntries oneTimePackages");
    if (!user || !user.isActive) {
      return { success: false, reason: "unauthorized" };
    }

    const now = new Date();
    let issuance = null;
    let milestoneIssuance = null;
    let redemptionSource: "monthly-coupon" | "milestone" = "monthly-coupon";

    if (params.issuanceId && mongoose.Types.ObjectId.isValid(params.issuanceId)) {
      issuance = await RedeemableIssuance.findOne({
        _id: params.issuanceId,
        userId: user._id,
      });
      if (!issuance) {
        milestoneIssuance = await MilestoneIssuance.findOne({
          _id: params.issuanceId,
          userId: user._id,
        });
        if (milestoneIssuance) {
          redemptionSource = "milestone";
        }
      }
    } else if (params.code) {
      const normalizedCode = params.code.trim().toUpperCase();
      issuance = await RedeemableIssuance.findOne({
        userId: user._id,
        code: normalizedCode,
      });

      if (!issuance) {
        const campaign = await MonthlyEntryCampaign.findOne({
          code: normalizedCode,
          isActive: true,
          startsAt: { $lte: now },
          // A personal-window campaign (validForHours set) hands each customer their
          // own deadline, so its own endsAt is a MINTING backstop, not a redemption
          // one — without this leg, a campaignMode: "global" issuance (whose row
          // carries no `code` of its own, so it can ONLY be found through this
          // by-campaign-code lookup) becomes unreachable the moment endsAt passes,
          // and the customer is told "invalid_code" instead of the truth.
          $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { validForHours: { $gte: 1 } }],
        });

        if (!campaign) {
          return { success: false, reason: "invalid_code" };
        }

        issuance = await RedeemableIssuance.findOne({
          campaignId: campaign._id,
          userId: user._id,
        });
      }

      if (!issuance) {
        const reward = await MilestoneReward.findOne({
          code: normalizedCode,
          isActive: true,
          $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }],
          $and: [{ $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { endsAt: { $exists: false } }] }],
        });
        if (reward) {
          milestoneIssuance = await MilestoneIssuance.findOne({
            milestoneRewardId: reward._id,
            userId: user._id,
            status: "active",
          }).sort({ issuedAt: -1 });
          if (milestoneIssuance) {
            redemptionSource = "milestone";
          }
        }
      }
    }

    if (!issuance && !milestoneIssuance) {
      return { success: false, reason: "campaign_not_found" };
    }

    if (redemptionSource === "milestone" && milestoneIssuance) {
      if (milestoneIssuance.status === "redeemed") {
        return { success: false, reason: "already_redeemed" };
      }
      if ((milestoneIssuance.expiresAt && milestoneIssuance.expiresAt <= now) || milestoneIssuance.status === "expired") {
        return { success: false, reason: "expired", expiresAt: milestoneIssuance.expiresAt ?? undefined };
      }

      const updatedMilestoneIssuance = await MilestoneIssuance.findOneAndUpdate(
        {
          _id: milestoneIssuance._id,
          userId: user._id,
          status: "active",
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
        },
        {
          $set: {
            status: "redeemed",
            redeemedAt: now,
          },
        },
        { new: true }
      );

      if (!updatedMilestoneIssuance) {
        return { success: false, reason: "concurrency_conflict" };
      }

      const milestoneRedemptionId = `milestone-${String(updatedMilestoneIssuance._id)}`;
      const milestoneLogContext = {
        path: "milestone-manual-claim",
        milestoneIssuanceId: String(updatedMilestoneIssuance._id),
      };
      // HOISTED ABOVE THE WALLET WRITE. Defined below it — as it used to be —
      // there was nothing to hand the grant back with when that write threw: the
      // exception escaped `redeem()`, the route answered 500, and the issuance
      // stayed `redeemed` with nothing granted. Same shape as
      // `autoRedeemMilestoneIssuance`'s "Step A", which this file already got
      // right; only its second half had been copied here.
      const reopenMilestoneIssuance = () =>
        MilestoneIssuance.updateOne(
          { _id: updatedMilestoneIssuance._id, status: "redeemed" },
          { $set: { status: "active" }, $unset: { redeemedAt: 1 } }
        );

      try {
        await User.findByIdAndUpdate(user._id, {
          $inc: { accumulatedEntries: updatedMilestoneIssuance.entriesAmount },
          $push: {
            redemptionHistory: {
              redemptionId: milestoneRedemptionId,
              redemptionType: "entry",
              pointsDeducted: 0,
              value: updatedMilestoneIssuance.entriesAmount,
              description: `Redeemed milestone reward (${updatedMilestoneIssuance.milestoneType})`,
              redeemedAt: now,
              status: "completed",
            },
          },
        });
      } catch (walletErr) {
        // Nothing has reached a draw yet, so the grant can go straight back.
        const handedBack = await RedemptionService.reopenAfterWalletFailure({
          userId: String(user._id),
          entriesAmount: updatedMilestoneIssuance.entriesAmount,
          redemptionId: milestoneRedemptionId,
          reopenIssuance: reopenMilestoneIssuance,
          walletErr,
          logContext: milestoneLogContext,
        });
        return { success: false, reason: handedBack ? "grant_unavailable" : "grant_unresolved" };
      }

      // The grant's outcome is the ONLY signal that the entries reached a draw.
      // Discarding it is what let a claim report success while granting nothing.
      const milestoneGrant = await RedemptionService.landEntriesOrCompensate({
        userId: String(user._id),
        entriesAmount: updatedMilestoneIssuance.entriesAmount,
        redemptionId: milestoneRedemptionId,
        reopenIssuance: reopenMilestoneIssuance,
        logContext: milestoneLogContext,
      });
      if (milestoneGrant !== "landed") {
        return { success: false, reason: milestoneGrant === "reversed" ? "grant_unavailable" : "grant_unresolved" };
      }

      return {
        success: true,
        entriesGranted: updatedMilestoneIssuance.entriesAmount,
        issuanceId: String(updatedMilestoneIssuance._id),
        redemptionKind: "milestone",
      };
    }

    if (!issuance) {
      return { success: false, reason: "campaign_not_found" };
    }

    const campaign = await MonthlyEntryCampaign.findById(issuance.campaignId);
    if (!campaign) {
      return { success: false, reason: "campaign_not_found" };
    }

    if (!isCampaignRedeemable(campaign, now)) {
      return { success: false, reason: "campaign_not_active" };
    }

    // Purchase-gated coupons require a REAL qualifying purchase inside the
    // campaign window — not a lifetime entry balance or an old subscription.
    // (Previously `accumulatedEntries === 0` was used as a proxy, which granted
    // "buy to unlock" coupons for free to any past purchaser / active member.)
    // For a personal-window campaign the qualifying purchase must be allowed to
    // land any time up to the redemption attempt — passing `endsAt: null` makes
    // the util's ceiling `now` instead of the campaign's own (possibly long-past)
    // endsAt. Legacy campaigns are NOT widened: that ceiling was hardened
    // deliberately (see hasQualifyingPurchase's doc comment).
    const purchaseReq = campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none");
    if (
      !hasQualifyingPurchase(
        user,
        personalWindowGoverns(campaign) ? { startsAt: campaign.startsAt, endsAt: null } : campaign,
        purchaseReq,
        now
      )
    ) {
      return { success: false, reason: "ineligible" };
    }

    if (issuance.status === "redeemed") {
      return { success: false, reason: "already_redeemed" };
    }

    // A refund calls unredeemMonthlyCouponRedemption, which restores
    // `status: "active"` and $unsets `redeemedAt` — leaving a refunded row
    // byte-identical to a never-redeemed one APART from `redeemedEverAt`. For a
    // personal-window campaign that is a money hole, not a cosmetic one: those
    // campaigns are `purchaseRequirement: "none"` (a cancel-click trigger has no
    // purchase to qualify on), so hasQualifyingPurchase above returns true
    // immediately and the customer can re-claim the full grant while holding a
    // full refund. `redeemedEverAt` is the permanent "this grant is spent"
    // marker already written with $min below and already read by decideRearm()
    // on the MINT side; this is the same rule on the REDEEM side.
    //
    // Scoped to personalWindowGoverns deliberately: legacy monthly-coupon
    // campaigns restore a refunded coupon to claimable on purpose, and that
    // behaviour is untouched here.
    if (personalWindowGoverns(campaign) && issuance.redeemedEverAt) {
      return { success: false, reason: "already_redeemed" };
    }

    if (issuance.expiresAt <= now || issuance.status === "expired") {
      return { success: false, reason: "expired", expiresAt: issuance.expiresAt };
    }

    const updatedIssuance = await RedeemableIssuance.findOneAndUpdate(
      {
        _id: issuance._id,
        userId: user._id,
        status: "active",
        expiresAt: { $gt: now },
        // Concurrency backstop for the redeemedEverAt check above — two claims
        // racing on a refunded row must not both win. Same personal-window
        // scoping, so the legacy filter is byte-identical to what it was.
        ...(personalWindowGoverns(campaign) ? { redeemedEverAt: { $exists: false } } : {}),
      },
      {
        $set: {
          status: "redeemed",
          redeemedAt: now,
        },
        // $min writes the field when absent and preserves the FIRST value when
        // present — exactly the audit semantics wanted. This is the permanent
        // "this grant is spent" marker read by decideRearm().
        $min: { redeemedEverAt: now },
      },
      { new: true }
    );

    if (!updatedIssuance) {
      return { success: false, reason: "concurrency_conflict" };
    }

    const couponRedemptionId = `monthly-coupon-${String(updatedIssuance._id)}`;

    // Did THIS call write redeemedEverAt? `$min` keeps the FIRST value, so a row
    // that already carried an older marker (a refunded legacy coupon) comes back
    // with that older date. Only the marker we wrote may be reversed — unsetting
    // an older one would erase real audit history and hand back a grant that was
    // genuinely spent. Exact-timestamp equality is the precise test.
    const wroteRedeemedEverAt =
      updatedIssuance.redeemedEverAt instanceof Date &&
      updatedIssuance.redeemedEverAt.getTime() === now.getTime();

    const couponLogContext = {
      path: "monthly-coupon-claim",
      issuanceId: String(updatedIssuance._id),
      campaignId: String(campaign._id),
    };
    // HOISTED ABOVE THE WALLET WRITE — and it must carry the
    // `wroteRedeemedEverAt`-conditional `$unset`, so an OLDER marker this call
    // did not write is never erased. Defined below the write, as it used to be,
    // a thrown wallet update escaped `redeem()` with the issuance left `redeemed`
    // and `redeemedEverAt` stamped: for a personal-window campaign (all three
    // live codes) that marker is terminal in both the pre-check and the atomic
    // filter, so the grant was spent for life for zero entries.
    const reopenCouponIssuance = () =>
      RedeemableIssuance.updateOne(
        { _id: updatedIssuance._id, status: "redeemed" },
        {
          $set: { status: "active" },
          $unset: wroteRedeemedEverAt ? { redeemedAt: 1, redeemedEverAt: 1 } : { redeemedAt: 1 },
        }
      );

    try {
      await User.findByIdAndUpdate(user._id, {
        $inc: { accumulatedEntries: updatedIssuance.entriesAmount },
        $push: {
          redemptionHistory: {
            redemptionId: couponRedemptionId,
            redemptionType: "entry",
            pointsDeducted: 0,
            value: updatedIssuance.entriesAmount,
            description: `Redeemed monthly free-entry coupon (${updatedIssuance.monthKey})`,
            redeemedAt: now,
            status: "completed",
          },
        },
      });
    } catch (walletErr) {
      // Nothing has reached a draw yet, so the grant can go straight back.
      const handedBack = await RedemptionService.reopenAfterWalletFailure({
        userId: String(user._id),
        entriesAmount: updatedIssuance.entriesAmount,
        redemptionId: couponRedemptionId,
        reopenIssuance: reopenCouponIssuance,
        walletErr,
        logContext: couponLogContext,
      });
      return { success: false, reason: handedBack ? "grant_unavailable" : "grant_unresolved" };
    }

    // The grant's outcome is the ONLY signal that the entries reached a draw.
    // Discarding it is what let a claim report success while granting nothing —
    // the customer was told "N free entries added", `redeemedEverAt` burned their
    // one-per-lifetime grant for good, and no draw ever received the entries.
    const couponGrant = await RedemptionService.landEntriesOrCompensate({
      userId: String(user._id),
      entriesAmount: updatedIssuance.entriesAmount,
      redemptionId: couponRedemptionId,
      reopenIssuance: reopenCouponIssuance,
      logContext: couponLogContext,
    });
    if (couponGrant !== "landed") {
      return { success: false, reason: couponGrant === "reversed" ? "grant_unavailable" : "grant_unresolved" };
    }

    console.log("Redeemable redeemed", {
      userId: user._id.toString(),
      issuanceId: String(updatedIssuance._id),
      campaignId: String(campaign._id),
      entriesGranted: updatedIssuance.entriesAmount,
    });

    return {
      success: true,
      entriesGranted: updatedIssuance.entriesAmount,
      issuanceId: String(updatedIssuance._id),
      redemptionKind: "monthly-coupon",
    };
  }

  /**
   * Undo a monthly-coupon redemption (refund path). Restores issuance to active and reverses entries.
   */
  static async unredeemMonthlyCouponRedemption(params: {
    userId: string;
    redeemableIssuanceId: string;
    /**
     * True when the caller's ledger reversal has ALREADY undone the entries — i.e.
     * `grants.campaignEntries` was counted into `legacyTotalEntries()` and a scoped
     * `drawGrants` row removed them from the right draw.
     *
     * Without this the refund path reversed the same coupon twice: `accumulatedEntries`
     * fell by 2x the coupon (and could go negative, since `User.updateOne` skips the
     * schema's `min: 0`), and the second `removeMajorDrawEntries` ran with NO drawId —
     * the legacy multi-draw walk that `remove-draw-entries.ts` itself calls "the
     * historical danger zone", which consumes entries oldest-first and can strip a
     * DIFFERENT, unrefunded draw. Reproduced end-to-end by
     * `npm run test:campaign-refund-reversal`.
     *
     * The issuance status and `redemptionHistory` row are restored either way — those
     * are this method's own responsibility and the ledger never touches them.
     */
    entriesAlreadyReversed?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, redeemableIssuanceId, entriesAlreadyReversed = false } = params;
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(redeemableIssuanceId)) {
      return { success: false, error: "invalid_ids" };
    }
    try {
      const issuance = await RedeemableIssuance.findOne({
        _id: new mongoose.Types.ObjectId(redeemableIssuanceId),
        userId: new mongoose.Types.ObjectId(userId),
        status: "redeemed",
      });
      if (!issuance) {
        return { success: false, error: "issuance_not_found_or_not_redeemed" };
      }
      const entriesAmount = issuance.entriesAmount;
      const redemptionId = `monthly-coupon-${String(issuance._id)}`;

      await RedeemableIssuance.updateOne(
        { _id: issuance._id },
        {
          $set: { status: "active" },
          // NEVER add redeemedEverAt here — it is the permanent "this grant is
          // spent" marker that stops a refund resetting a one-per-lifetime code.
          $unset: { redeemedAt: 1 },
        }
      );

      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        {
          // Only this method can undo the redemption record; the entry counter is the
          // ledger's job whenever the ledger already counted it.
          ...(entriesAlreadyReversed ? {} : { $inc: { accumulatedEntries: -entriesAmount } }),
          $pull: { redemptionHistory: { redemptionId } },
        }
      );

      if (!entriesAlreadyReversed) {
        const { removeMajorDrawEntries } = await import("@/utils/draws/remove-draw-entries");
        await removeMajorDrawEntries(userId, entriesAmount, "bonus-entry-promo");
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Auto-grant an ACTIVE milestone issuance straight into the Major Draw — the
   * Membership Streak delivery path (autoGrant rewards; no manual claim step).
   * Mirrors the atomic manual-claim block above: findOneAndUpdate active→redeemed
   * is the concurrency gate (a racing caller loses and no-ops), then the entries
   * land via DrawGrantService under the "streak" source bucket. The milestone
   * re-check is skipped to prevent re-entrancy (streak entries are excluded from
   * the entries-gained metric anyway).
   */
  static async autoRedeemMilestoneIssuance(
    userId: string,
    milestoneIssuanceId: string
  ): Promise<{ success: boolean; entriesGranted?: number; error?: string }> {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(milestoneIssuanceId)) {
      return { success: false, error: "invalid_ids" };
    }
    const now = new Date();
    const updated = await MilestoneIssuance.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(milestoneIssuanceId),
        userId: new mongoose.Types.ObjectId(userId),
        status: "active",
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      {
        $set: {
          status: "redeemed",
          redeemedAt: now,
        },
      },
      { new: true }
    );
    if (!updated) {
      return { success: false, error: "not_active_or_concurrent" };
    }

    const redemptionId = `milestone-${String(updated._id)}`;
    const reopenIssuance = () =>
      MilestoneIssuance.updateOne(
        { _id: updated._id, status: "redeemed" },
        { $set: { status: "active" }, $unset: { redeemedAt: 1 } }
      );

    // Step A — wallet counter + history row. If this fails nothing else has
    // happened yet: re-open the issuance so the auto-grant sweep retries later.
    try {
      await User.findByIdAndUpdate(new mongoose.Types.ObjectId(userId), {
        $inc: { accumulatedEntries: updated.entriesAmount },
        $push: {
          redemptionHistory: {
            redemptionId,
            redemptionType: "entry",
            pointsDeducted: 0,
            value: updated.entriesAmount,
            description: "Streak milestone — landed automatically",
            redeemedAt: now,
            status: "completed",
          },
        },
      });
    } catch (walletErr) {
      await reopenIssuance().catch((revertErr) =>
        console.error("Streak auto-grant compensation (issuance re-open) failed:", revertErr)
      );
      return {
        success: false,
        error: `wallet_update_failed_reverted: ${walletErr instanceof Error ? walletErr.message : String(walletErr)}`,
      };
    }

    // Step B — land the entries. A paid-for milestone must never vanish behind a
    // "redeemed" status with zero draw entries: when the draw write VERIFIABLY
    // did not land, revert step A, then re-open the issuance so the sweep
    // retries. The issuance is re-opened ONLY when the wallet revert succeeded —
    // otherwise a sweep retry would double-count the wallet $inc; on that
    // double-fault we leave it redeemed and log loudly.
    //
    // An `unconfirmed` write is NOT reverted, for the same reason the manual
    // claim above does not revert one: re-opening the issuance over entries that
    // may already be in the draw makes the sweep grant them a SECOND time.
    let outcome: DrawGrantOutcome;
    try {
      outcome = await DrawGrantService.grantMonthlyCouponEntries(userId, updated.entriesAmount, "streak", {
        skipMilestoneCheck: true,
      });
    } catch (e) {
      outcome = { status: "unconfirmed", reason: e instanceof Error ? e.message : String(e) };
    }
    if (outcome.status === "unconfirmed") {
      console.error("Streak auto-grant write UNCONFIRMED — nothing reverted, issuance left redeemed, reconcile by hand:", {
        userId,
        milestoneIssuanceId,
        error: outcome.reason,
      });
      return { success: false, error: `grant_unconfirmed_not_reverted: ${outcome.reason}` };
    }
    if (outcome.status === "not_written") {
      const msg = outcome.reason;
      let walletReverted = false;
      try {
        await User.updateOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          { $inc: { accumulatedEntries: -updated.entriesAmount }, $pull: { redemptionHistory: { redemptionId } } }
        );
        walletReverted = true;
      } catch (revertErr) {
        console.error("Streak auto-grant compensation (wallet revert) FAILED — issuance left redeemed:", {
          userId,
          milestoneIssuanceId,
          revertErr,
        });
      }
      if (walletReverted) {
        await reopenIssuance().catch((revertErr) =>
          console.error("Streak auto-grant compensation (issuance re-open) failed:", revertErr)
        );
      }
      console.error("Streak auto-grant did not land — issuance re-opened for the sweep to retry:", {
        userId,
        milestoneIssuanceId,
        error: msg,
      });
      return { success: false, error: `grant_failed_reverted: ${msg}` };
    }

    return { success: true, entriesGranted: updated.entriesAmount };
  }

  /**
   * Undo milestone reward redemption (entries granted when user redeemed an active issuance).
   */
  static async unredeemMilestoneRedemption(params: {
    userId: string;
    milestoneIssuanceId: string;
    /**
     * Same contract as the monthly-coupon arm: true when the caller's ledger reversal
     * already undid the entries.
     *
     * Only the CAMPAIGN-CODE milestone flow sets it. That flow stamps
     * `grants.campaignEntries` + a scoped `drawGrants` row alongside
     * `campaign.milestoneIssuanceId` (payment-processing.ts), so the refund's first two
     * steps have already reversed both — repeating them here is the same double-reversal
     * fixed on the monthly arm.
     *
     * The milestone AUTO-GRANT flow (`grants.milestoneIssuanceIds`, written at
     * payment-processing.ts:777 and reversed by the `milestoneRevoke` step) does NOT
     * feed those ledger fields, so it leaves this false and this method still owns the
     * reversal. Defaulting to false is what keeps that path unchanged.
     */
    entriesAlreadyReversed?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, milestoneIssuanceId, entriesAlreadyReversed = false } = params;
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(milestoneIssuanceId)) {
      return { success: false, error: "invalid_ids" };
    }
    try {
      const doc = await MilestoneIssuance.findOne({
        _id: new mongoose.Types.ObjectId(milestoneIssuanceId),
        userId: new mongoose.Types.ObjectId(userId),
        status: "redeemed",
      });
      if (!doc) {
        return { success: false, error: "not_redeemed" };
      }
      const entriesAmount = doc.entriesAmount;
      const redemptionId = `milestone-${String(doc._id)}`;

      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        {
          ...(entriesAlreadyReversed ? {} : { $inc: { accumulatedEntries: -entriesAmount } }),
          $pull: { redemptionHistory: { redemptionId } },
        }
      );

      if (!entriesAlreadyReversed) {
        const { removeMajorDrawEntries } = await import("@/utils/draws/remove-draw-entries");
        // Streak auto-grants land in the "streak" bucket; every other milestone
        // redemption lands in "bonus-entry-promo" — reversal must match the grant.
        const sourceKey = doc.milestoneType === "streak-months" ? "streak" : "bonus-entry-promo";
        await removeMajorDrawEntries(userId, entriesAmount, sourceKey);
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
