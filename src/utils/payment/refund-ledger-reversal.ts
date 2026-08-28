/**
 * Full refund: reverse BenefitsGranted.data.grants (ledger) + legacy fallback.
 */

import mongoose from "mongoose";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { removeMajorDrawEntries, removeMiniDrawEntries } from "@/utils/draws/remove-draw-entries";
import { PromoRedemptionService } from "@/services/promo/PromoRedemptionService";
import { RedemptionService } from "@/services/redeemables/RedemptionService";
import { MilestoneService } from "@/services/milestones";
import type { IPaymentGrantLedger } from "@/types/payment-ledger";
import type { IPaymentEvent } from "@/models/PaymentEvent";
import type { IUser } from "@/models/User";
import { runReversalOrchestrator } from "@/utils/payment/reversers/orchestrator";
import type { PaymentReverser, ReversalContext } from "@/utils/payment/reversers/types";

function getGrants(ev: IPaymentEvent): IPaymentGrantLedger | null {
  const data = ev.data as { grants?: IPaymentGrantLedger };
  return data?.grants ?? null;
}

function legacyTotalEntries(ev: IPaymentEvent): number {
  const g = getGrants(ev);
  if (g) {
    return (
      (g.baseEntries || 0) +
      (g.bonusPromoEntries || 0) +
      (g.promoLinkEntries || 0) +
      (g.campaignEntries || 0)
    );
  }
  return ev.data.entries || 0;
}

function legacyRewardsPoints(ev: IPaymentEvent): number {
  const g = getGrants(ev);
  if (g && g.rewardsPoints !== undefined) return g.rewardsPoints;
  return ev.data.points || 0;
}

function legacyLastMonthDelta(ev: IPaymentEvent, packageType: string): number {
  const g = getGrants(ev);
  if (g?.lastMonthDelta !== undefined) return g.lastMonthDelta;
  if (packageType === "membership") return ev.data.entries || 0;
  return 0;
}

export async function countNonRefundedMembershipGrants(userId: string): Promise<number> {
  const refunded = await PaymentEvent.distinct("paymentIntentId", {
    userId: new mongoose.Types.ObjectId(userId),
    eventType: "RefundProcessed",
  });
  return PaymentEvent.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    packageType: "membership",
    eventType: "BenefitsGranted",
    paymentIntentId: { $nin: refunded },
  });
}

function buildLedgerReversalSteps(
  user: IUser,
  ctx: ReversalContext,
  grants: IPaymentGrantLedger | null,
  packageType: string,
  totalEntryDelta: number,
  pointsDelta: number,
  paymentIntentId: string
): PaymentReverser[] {
  const { originalEvent, userId, reversalIssues } = ctx;

  return [
    {
      stepId: "accumulatedEntriesAndRewardsPoints",
      reverse: async () => {
        if (totalEntryDelta !== 0) {
          await User.updateOne({ _id: user._id }, { $inc: { accumulatedEntries: -totalEntryDelta } });
        }
        if (pointsDelta !== 0) {
          await User.updateOne({ _id: user._id }, { $inc: { rewardsPoints: -pointsDelta } });
        }
      },
    },
    {
      stepId: "drawEntries",
      reverse: async () => {
        if (grants?.drawGrants?.length) {
          console.log(`[refund-reversal] drawGrants ledger present — using scoped removal`, {
            userId,
            paymentIntentId,
            grantCount: grants.drawGrants.length,
          });
          for (const row of grants.drawGrants) {
            try {
              if (row.kind === "major") {
                // Pass the ledger's drawId so removal is scoped to THIS draw only.
                // Without it, the function falls back to walking every draw the
                // user has entries in, which over-removed entries from prior
                // months' draws and silently corrupted historical totals.
                await removeMajorDrawEntries(
                  userId,
                  row.entries,
                  // An unchecked `as` on a `string` field, so this list gates
                  // nothing at runtime — it is documentation. It had drifted
                  // three keys behind the schema (referral, cancellation-upsell,
                  // streak); completed here so it stops reading like a guarantee
                  // it never provided.
                  row.sourceKey as
                    | "membership"
                    | "one-time-package"
                    | "upsell"
                    | "mini-draw"
                    | "referral"
                    | "bonus-entry-promo"
                    | "promo-link"
                    | "cancellation-upsell"
                    | "streak"
                    | "shop",
                  row.drawId
                );
              } else {
                await removeMiniDrawEntries(
                  userId,
                  row.drawId,
                  row.entries,
                  row.sourceKey as
                    | "mini-draw-package"
                    | "upsell"
                    | "free-entry"
                    | "bonus-entry-promo"
                    | "promo-link"
                );
              }
            } catch (e) {
              reversalIssues.push({
                step: `drawGrant:${row.kind}:${row.sourceKey}`,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        } else {
          console.log(`[refund-reversal] no drawGrants ledger — falling back to legacy walk`, {
            userId,
            paymentIntentId,
            packageType,
            entries: originalEvent.data.entries,
          });
          const entries = originalEvent.data.entries || 0;
          if (entries > 0) {
            // The final `: "mini-draw"` is a FALLBACK, not a match — any packageType
            // not named above lands there and is removed from the wrong bucket via
            // the drawId-less multi-draw walk, the documented over-removal pattern
            // (docs/draws/gotchas.md). "shop" therefore needs an explicit arm; it is
            // not optional politeness.
            const source =
              packageType === "membership"
                ? "membership"
                : packageType === "one-time"
                ? "one-time-package"
                : packageType === "upsell"
                ? "upsell"
                : packageType === "shop"
                ? "shop"
                : "mini-draw";
            if (packageType === "mini-draw") {
              const md = originalEvent.data.miniDrawId as string | undefined;
              if (md) {
                await removeMiniDrawEntries(userId, md, entries, "mini-draw-package");
              }
            } else if (packageType === "upsell") {
              try {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                const miniDrawId = pi.metadata?.miniDrawId;
                if (miniDrawId) {
                  await removeMiniDrawEntries(userId, miniDrawId, entries, "upsell");
                } else {
                  await removeMajorDrawEntries(userId, entries, "upsell");
                }
              } catch {
                await removeMajorDrawEntries(userId, entries, "upsell");
              }
            } else {
              await removeMajorDrawEntries(userId, entries, source);
            }
          }
        }
      },
    },
    {
      stepId: "packageArraysAndSubscription",
      reverse: async () => {
        switch (packageType) {
          case "one-time":
            await reverseOneTimePackageLedger(user, originalEvent);
            break;
          case "membership":
            await reverseMembershipLedger(user, originalEvent, grants, paymentIntentId);
            break;
          case "upsell":
            await reverseUpsellLedger(user, originalEvent, paymentIntentId);
            break;
          case "mini-draw":
            await reverseMiniDrawLedger(user, originalEvent, paymentIntentId);
            break;
          default:
            break;
        }
      },
    },
    {
      stepId: "promoLinkUnredeem",
      reverse: async () => {
        if (!grants?.promoLink?.promoLinkId) return;
        try {
          await PromoRedemptionService.unredeem({
            promoLinkId: grants.promoLink.promoLinkId,
            userId,
          });
        } catch (e) {
          reversalIssues.push({
            step: "promoLink.unredeem",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
    },
    {
      stepId: "campaignUnredeem",
      reverse: async () => {
        if (grants?.campaign?.code && grants.campaign.redemptionKind === "monthly-coupon" && grants.campaign.monthlyIssuanceId) {
          try {
            const r = await RedemptionService.unredeemMonthlyCouponRedemption({
              userId,
              redeemableIssuanceId: grants.campaign.monthlyIssuanceId,
              // The `accumulatedEntriesAndRewardsPoints` step above already subtracted
              // these (legacyTotalEntries includes campaignEntries) and `drawEntries`
              // already removed them from the ledger's OWN draw. Letting the service
              // repeat both is the double-reversal fixed 2026-08-28. Only claim that
              // when the ledger genuinely carried the figure — a grants row with a
              // campaign but a zero/absent campaignEntries was never reversed above,
              // so the service must still do it.
              entriesAlreadyReversed: (grants.campaignEntries || 0) > 0,
            });
            if (!r.success) {
              reversalIssues.push({ step: "campaign.unredeemMonthly", error: r.error || "failed" });
            }
          } catch (e) {
            reversalIssues.push({
              step: "campaign.unredeemMonthly",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } else if (grants?.campaign?.redemptionKind === "milestone" && grants.campaign.milestoneIssuanceId) {
          try {
            const r = await RedemptionService.unredeemMilestoneRedemption({
              userId,
              milestoneIssuanceId: grants.campaign.milestoneIssuanceId,
              // Same reasoning as the monthly-coupon arm directly above: a campaign-code
              // milestone stamps campaignEntries + a scoped drawGrants row, both of which
              // the earlier steps have already reversed. The `milestoneRevoke` step's own
              // path (auto-grants) does not pass this and is unaffected.
              entriesAlreadyReversed: (grants.campaignEntries || 0) > 0,
            });
            if (!r.success) {
              reversalIssues.push({ step: "campaign.unredeemMilestone", error: r.error || "failed" });
            }
          } catch (e) {
            reversalIssues.push({
              step: "campaign.unredeemMilestone",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      },
    },
    {
      stepId: "milestoneRevoke",
      reverse: async () => {
        if (!grants?.milestoneIssuanceIds?.length) return;
        try {
          const mr = await MilestoneService.revokeIssuancesFromPaymentEvent(userId, grants.milestoneIssuanceIds);
          if (mr.errors.length) {
            mr.errors.forEach((err) => reversalIssues.push({ step: "milestone.revoke", error: err }));
          }
        } catch (e) {
          reversalIssues.push({
            step: "milestone.revoke",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
    },
  ];
}

export async function reverseLedgerBenefits(params: {
  userId: string;
  originalEvent: IPaymentEvent;
  paymentIntentId: string;
  refundEventId: string;
  reversalIssues: Array<{ step: string; error: string }>;
}): Promise<void> {
  const { userId, originalEvent, paymentIntentId, refundEventId, reversalIssues } = params;
  const user = await User.findById(userId);
  if (!user) return;

  const grants = getGrants(originalEvent);
  const packageType = originalEvent.packageType;
  const totalEntryDelta = legacyTotalEntries(originalEvent);
  const pointsDelta = legacyRewardsPoints(originalEvent);

  const ctx: ReversalContext = {
    userId,
    originalEvent,
    paymentIntentId,
    refundEventId,
    reversalIssues,
  };

  const steps = buildLedgerReversalSteps(
    user as IUser,
    ctx,
    grants,
    packageType,
    totalEntryDelta,
    pointsDelta,
    paymentIntentId
  );
  await runReversalOrchestrator(ctx, steps);

  await PaymentEvent.updateOne(
    { _id: refundEventId },
    {
      $set: {
        "data.reversed": {
          entries: totalEntryDelta,
          points: pointsDelta,
          packageType,
          milestoneIds: grants?.milestoneIssuanceIds,
          promoLinkCode: grants?.promoLink?.code,
          campaignCode: grants?.campaign?.code,
        },
        "data.reversalIssues": reversalIssues,
      },
    }
  );
}

async function reverseOneTimePackageLedger(user: IUser, originalEvent: IPaymentEvent): Promise<void> {
  const packageId = originalEvent.packageId;
  if (!packageId) return;
  const purchaseTimestamp = originalEvent.timestamp;
  const userDoc = await User.findById(user._id);
  if (!userDoc?.oneTimePackages?.length) return;
  const packagesToMatch = userDoc.oneTimePackages.filter((pkg) => pkg.packageId === packageId && pkg.isActive);
  if (packagesToMatch.length === 0) return;
  const packageToRemove = packagesToMatch.reduce((closest, current) => {
    const closestDiff = Math.abs(closest.purchaseDate.getTime() - purchaseTimestamp.getTime());
    const currentDiff = Math.abs(current.purchaseDate.getTime() - purchaseTimestamp.getTime());
    return currentDiff < closestDiff ? current : closest;
  });
  const purchaseDate = new Date(packageToRemove.purchaseDate);
  const dateRangeStart = new Date(purchaseDate.getTime() - 2 * 60 * 60 * 1000);
  const dateRangeEnd = new Date(purchaseDate.getTime() + 2 * 60 * 60 * 1000);
  await User.updateOne(
    {
      _id: user._id,
      oneTimePackages: {
        $elemMatch: {
          packageId,
          purchaseDate: { $gte: dateRangeStart, $lte: dateRangeEnd },
        },
      },
    },
    {
      $pull: {
        oneTimePackages: {
          packageId,
          purchaseDate: { $gte: dateRangeStart, $lte: dateRangeEnd },
        },
      },
    }
  );
}

async function reverseMembershipLedger(
  user: IUser,
  originalEvent: IPaymentEvent,
  grants: IPaymentGrantLedger | null,
  paymentIntentId: string
): Promise<void> {
  // Membership Streak: a fully refunded COUNTED renewal must give back its +1.
  // The atomic status flip (succeeded/recovered → refunded, pre-image gate) makes
  // the decrement idempotent across replayed refund events AND removes the cycle
  // from the backfill walker's count (it only reads succeeded/recovered), so
  // repair runs agree with the live counter. Create invoices never have a
  // subscription_cycle row, so joining payments are naturally excluded.
  try {
    const MembershipRenewalCycle = (await import("@/models/MembershipRenewalCycle")).default;
    const countedCycle = await MembershipRenewalCycle.findOneAndUpdate(
      {
        userId: user._id,
        paymentIntentId,
        billingReason: "subscription_cycle",
        status: { $in: ["succeeded", "recovered"] },
      },
      { $set: { status: "refunded" } },
      { new: false }
    );
    if (countedCycle) {
      await User.updateOne({ _id: user._id }, { $inc: { "subscription.streakMonths": -1 } });
      await User.updateOne({ _id: user._id }, { $max: { "subscription.streakMonths": 0 } });
    }
  } catch (e) {
    console.error("Refund: streak decrement failed (cycle row untouched or partially reversed):", e);
  }

  if (user.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      if (subscription.status === "active" || subscription.status === "trialing") {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      }
    } catch (e) {
      console.error("Refund: Stripe subscription cancel failed", e);
    }
  }

  const delta = legacyLastMonthDelta(originalEvent, "membership");
  if (delta !== 0) {
    await User.updateOne(
      { _id: user._id },
      { $inc: { "subscription.lastMonthAccumulatedEntries": -delta } }
    );
    await User.updateOne({ _id: user._id }, { $max: { "subscription.lastMonthAccumulatedEntries": 0 } });
  }

  const remaining = await countNonRefundedMembershipGrants(user._id.toString());
  if (remaining === 0) {
    await User.updateOne({ _id: user._id }, { $unset: { "subscription.lastMonthAccumulatedEntries": 1 } });
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "subscription.isActive": false,
        "subscription.autoRenew": false,
        "subscription.endDate": new Date(),
        "subscription.status": "canceled",
      },
    }
  );
}

async function reverseUpsellLedger(user: IUser, originalEvent: IPaymentEvent, paymentIntentId: string): Promise<void> {
  const offerId = originalEvent.packageId;
  if (!offerId) return;
  await User.updateOne(
    { _id: user._id },
    { $pull: { upsellPurchases: { offerId } } }
  );
}

async function reverseMiniDrawLedger(user: IUser, originalEvent: IPaymentEvent, paymentIntentId: string): Promise<void> {
  await User.updateOne(
    { _id: user._id },
    { $pull: { miniDrawPackages: { stripePaymentIntentId: paymentIntentId } } }
  );
}
