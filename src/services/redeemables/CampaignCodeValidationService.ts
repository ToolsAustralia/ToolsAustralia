/**
 * Checkout-time validation for a monthly-coupon / bonus campaign code.
 *
 * This is the PREVIEW half of redemption: `/api/codes/validate` asks it whether
 * a code may be applied, the membership modal shows APPLIED on the answer and
 * threads `campaignCode` into Stripe metadata, and `RedemptionService.redeem`
 * is what actually runs after payment. The two must agree — a `valid: true`
 * here that redemption later refuses is the worst failure this path has: the
 * customer pays, sees no error at any point, and receives nothing
 * (`checkAndRedeemCampaign` treats a redemption miss as non-blocking).
 *
 * WHY THIS IS A SERVICE AND NOT THE ROUTE HANDLER. It runs two Mongo queries,
 * applies `personalWindowGoverns`, and composes customer-facing dated copy —
 * business logic, which CLAUDE.md's layering rule keeps out of `app/api/**`.
 * It previously lived in the route and was `export`ed solely so a service test
 * could import it from `@/app/api/**`. Same move R12 made for the redeem route.
 *
 * IDENTITY IS THE CALLER'S SESSION, NEVER A BODY FIELD. `userId` here is
 * resolved from `getServerSession` by the route. It must never be taken from
 * the request body: the per-user legs below disclose whether a named customer
 * holds a code, whether they spent it, and the exact instant of their personal
 * window — and these codes are mass-distributed by email, so "attacker holds a
 * code plus a victim's ObjectId" is the normal case, not an exotic one.
 */
import mongoose from "mongoose";
import MonthlyEntryCampaign, { type PurchaseRequirement } from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { personalWindowGoverns } from "@/utils/redeemables/bonus-code-policy";
import { formatExpiryLabelAEST } from "@/utils/common/timezone";

/**
 * The customer-facing refusal sentences, in ONE place.
 *
 * `/api/codes/validate` and `/api/redeemables/redeem` refuse for the same
 * reasons and used to render two different strings for each — including
 * "This code expired {label}." (no "on") on the redeem side. Rule 11 applies to
 * every one of these: entries are a free inclusion with the pack or membership,
 * never sold and never priced per unit, and nothing here may frame a draw in
 * odds/chance terms.
 */
export const CAMPAIGN_CODE_ALREADY_REDEEMED_MESSAGE = "This code has already been redeemed.";
export const CAMPAIGN_CODE_NOT_HELD_MESSAGE = "This code isn't available on your account.";
export const CAMPAIGN_CODE_NOT_FOUND_MESSAGE = "Invalid campaign code";

/**
 * "This code expired on Monday 5 October 2026, 3:00PM AEDT."
 *
 * The example carries a mid-afternoon time on purpose. Until 2026-08-26 every bonus
 * code died at 11:59PM Sydney on a calendar day, so this string was always an
 * end-of-day one; it is now an exact 72-hour offset from the instant the code was
 * issued and lands wherever that falls. Never trim the time out of this sentence to
 * "expired on {date}" — the customer can be inside the right calendar day and still
 * be past the deadline, and the label is the ONLY place they are told which.
 */
export function campaignCodeExpiredMessage(expiresAt: Date): string {
  return `This code expired on ${formatExpiryLabelAEST(expiresAt)}.`;
}

export type CampaignCodeValidation =
  | {
      valid: true;
      code: string;
      campaignName?: string;
      purchaseRequirement: PurchaseRequirement;
    }
  | {
      valid: false;
      /**
       * Machine-readable so the route can tell "matched nothing" from "matched,
       * but not for you" without comparing display strings — a copy edit to one
       * literal used to be able to silently change routing behaviour.
       */
      reason: "not_found" | "already_redeemed" | "expired" | "not_held";
      message: string;
    };

export class CampaignCodeValidationService {
  /**
   * @param params.userId The AUTHENTICATED caller's id, or undefined for a
   *   guest. Undefined falls back to the campaign-window-only answer, which is
   *   what guest checkout needs and discloses nothing about any customer.
   */
  static async validate(params: { code: string; userId?: string }): Promise<CampaignCodeValidation> {
    const normalizedCode = params.code.trim().toUpperCase();
    const now = new Date();

    const campaign = await MonthlyEntryCampaign.findOne({
      code: normalizedCode,
      isActive: true,
      startsAt: { $lte: now },
      // This gate fires FIRST, at checkout, before RedemptionService ever runs —
      // a personal-window campaign (validForHours set) hands each customer their
      // own deadline, so its endsAt is a minting backstop, not a redemption one.
      // Without this leg, checkout would call a coupon invalid that the server
      // would actually honour. Mirrors RedemptionService.ts / RedeemablesWalletService.ts.
      $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { validForHours: { $gte: 1 } }],
    })
      .select("_id code name requiresPurchase purchaseRequirement startsAt endsAt neverExpires validForHours")
      .lean();

    if (!campaign) {
      return { valid: false, reason: "not_found", message: CAMPAIGN_CODE_NOT_FOUND_MESSAGE };
    }

    // A malformed id must not CastError into a 500 — and after the session move
    // an invalid id here means a malformed session, not hostile input, so the
    // safe read is "treat as a guest" rather than throw.
    const callerId = params.userId && mongoose.Types.ObjectId.isValid(params.userId) ? params.userId : undefined;

    if (callerId) {
      const existingIssuance = await RedeemableIssuance.findOne({
        campaignId: campaign._id,
        userId: callerId,
      })
        .select("status expiresAt redeemedEverAt")
        .lean();

      // A code the caller does not hold is NOT applicable to them, and saying
      // otherwise is the "pays and gets nothing" bug: RedemptionService.redeem
      // returns campaign_not_found for a non-holder and payment-processing
      // treats that as non-blocking, so the customer is charged, shown APPLIED,
      // and granted zero entries with no error anywhere. These codes are
      // per-customer and forwardable, so a shared code hits this constantly.
      if (!existingIssuance) {
        return { valid: false, reason: "not_held", message: CAMPAIGN_CODE_NOT_HELD_MESSAGE };
      }

      if (existingIssuance.status === "redeemed") {
        return { valid: false, reason: "already_redeemed", message: CAMPAIGN_CODE_ALREADY_REDEEMED_MESSAGE };
      }

      // A refund restores status:"active" and $unsets redeemedAt, so a spent
      // grant reads as claimable here unless redeemedEverAt is honoured — the
      // same gate RedemptionService.redeem enforces, scoped the same way so
      // legacy monthly-coupon campaigns keep today's restore behaviour.
      if (personalWindowGoverns(campaign) && existingIssuance.redeemedEverAt) {
        return { valid: false, reason: "already_redeemed", message: CAMPAIGN_CODE_ALREADY_REDEEMED_MESSAGE };
      }

      // The campaign's own backstop no longer vetoes a personal-window campaign
      // (the $or leg above), but THIS customer's personal deadline still can —
      // and deserves the dated reason, not a bare "invalid campaign code".
      if (personalWindowGoverns(campaign) && existingIssuance.expiresAt <= now) {
        return {
          valid: false,
          reason: "expired",
          message: campaignCodeExpiredMessage(existingIssuance.expiresAt),
        };
      }
    }

    return {
      valid: true,
      code: campaign.code,
      campaignName: campaign.name,
      purchaseRequirement: campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none"),
    };
  }

  /**
   * The AUTHORITATIVE check, run server-side at checkout, deciding whether a
   * campaign code may be written into Stripe metadata.
   *
   * WHY THIS EXISTS AND `validate()` IS NOT ENOUGH. `/api/codes/validate` can
   * only answer per-customer when the caller has a session — and the population
   * these codes target does not. `MembershipModal` computes its user id as
   * `isAuthenticated ? userData._id : guestUserData.userId`, and step-1
   * registration in this codebase does NOT authenticate (CLAUDE.md rule 6), so a
   * customer applying a code straight after registering is a GUEST. The guest
   * leg answers from the campaign window alone, so a guest who holds no
   * issuance, or whose personal window has lapsed, would see APPLIED, pay, and
   * receive nothing — precisely the `checkout-start` / LOCKIN100 population.
   *
   * These routes are the right place because they already hold a user id the
   * SERVER resolved (by session, or by looking the email up) at the exact point
   * they write the metadata. No body field is trusted.
   *
   * Behaviour on refusal: drop the code and log. It must NOT fail the purchase —
   * the customer is buying a membership or a pack, and a coupon that does not
   * apply is not a reason to refuse their money. Dropping is also recoverable:
   * a genuine holder keeps the issuance in their rewards wallet and can claim it
   * there, whereas leaving a non-holder's code in the metadata produces the
   * silent "paid and got nothing" the webhook cannot report.
   *
   * @returns the campaign's canonical code when this user genuinely holds a
   *   redeemable issuance for it, otherwise `undefined`.
   */
  static async resolveCodeForCheckout(params: {
    code?: string | null;
    /** A SERVER-resolved user id (session, or an email lookup) — never a body field. */
    userId?: string | null;
    /** Route name, for the log line only. */
    context: string;
  }): Promise<string | undefined> {
    const raw = params.code?.trim();
    if (!raw) return undefined;

    // No resolved account means no issuance can exist: issuances are keyed
    // { campaignId, userId }, and RedemptionService requires a real user row.
    // So a code applied by someone with no account can never redeem — carrying
    // it into metadata only defers the failure past the payment.
    if (!params.userId) {
      console.error("[campaign-code] dropped at checkout — no resolved account for this purchase", {
        context: params.context,
        code: raw.toUpperCase(),
      });
      return undefined;
    }

    try {
      const result = await this.validate({ code: raw, userId: params.userId });
      if (!result.valid) {
        console.error("[campaign-code] dropped at checkout — this customer cannot redeem it", {
          context: params.context,
          code: raw.toUpperCase(),
          userId: params.userId,
          reason: result.reason,
        });
        return undefined;
      }
      return result.code;
    } catch (error) {
      // FAIL CLOSED. An unreadable campaign/issuance must not become a code in
      // Stripe metadata that nothing later validates. A genuine holder still has
      // the wallet claim path, so this is recoverable; the reverse is not.
      console.error("[campaign-code] dropped at checkout — validation failed", {
        context: params.context,
        code: raw.toUpperCase(),
        error,
      });
      return undefined;
    }
  }

  /**
   * Record, ON OUR OWN SIDE, that this customer has this code applied to the
   * checkout they are about to pay — then forget about it unless the Stripe
   * stamp goes missing.
   *
   * WHY. The stamp lives only in Stripe metadata, and the browser gives up on
   * the request that writes it. Observed live on this branch: the server
   * answered `200 in 14903ms` against the client's 15s cap, the browser had
   * already aborted, the charge went through, and the webhook saw no
   * `campaignCode`. Raising the cap does not fix that — it only moves it, and it
   * cannot fix a dropped connection or a browser closed mid-spinner. The
   * asymmetry is the point: THE SERVER KNOWS whether the customer asked for the
   * code, and the browser does not. So the server writes it down where the
   * webhook can find it, and the outcome stops depending on a client-side race.
   *
   * Written BEFORE the Stripe update, deliberately: the Stripe round trip is the
   * slow, failure-prone half, and a record written only on its success would be
   * missing in precisely the cases this exists for.
   *
   * NEVER THROWS and never blocks the sale — a failure here just means we fall
   * back to today's behaviour, where the Stripe stamp is the only record.
   *
   * @param params.campaignCode the canonical code `resolveCodeForCheckout`
   *   returned, or `null`/`undefined` to CLEAR — a customer who REMOVES an
   *   applied code must not be recovered into it by the fallback.
   */
  static async recordCheckoutIntent(params: {
    userId?: string | null;
    campaignCode?: string | null;
    /** The Stripe object (`sub_…` / `pi_…`) being stamped. Audit only. */
    targetId: string;
  }): Promise<void> {
    const { userId, campaignCode, targetId } = params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return;

    try {
      if (!campaignCode) {
        // CLEAR. Scoped to rows that actually carry an intent so this is a no-op
        // for the overwhelming majority of checkouts, which never applied a code.
        await RedeemableIssuance.updateMany(
          { userId, checkoutIntentAt: { $ne: null } },
          { $set: { checkoutIntentAt: null, checkoutIntentTargetId: null } }
        );
        return;
      }

      const campaign = await MonthlyEntryCampaign.findOne({ code: campaignCode.trim().toUpperCase() })
        .select("_id")
        .lean();
      if (!campaign) return;

      await RedeemableIssuance.updateOne(
        { campaignId: campaign._id, userId },
        { $set: { checkoutIntentAt: new Date(), checkoutIntentTargetId: targetId } }
      );
    } catch (error) {
      console.error("[campaign-code] could not record checkout intent — falling back to the Stripe stamp alone", {
        userId,
        code: campaignCode ?? null,
        error,
      });
    }
  }

  /**
   * How long after a customer applied a code we will still finish the job for
   * them if the Stripe stamp went missing.
   *
   * Sized on the gap it has to span: the applied code reaches this service at
   * the PURCHASE click, and the paid-invoice webhook that reads it back lands
   * seconds later — minutes at worst on a Stripe retry. 30 minutes is generous
   * for that and still far too short to reach the customer's NEXT purchase or a
   * renewal invoice, which is what keeps this from auto-redeeming a code they
   * did not apply.
   */
  static readonly CHECKOUT_INTENT_WINDOW_MS = 30 * 60 * 1000;

  /**
   * The recovery read: "did this customer apply a code to a checkout just now,
   * that the paid object does not carry?"
   *
   * ONLY consulted when the Stripe object has no `campaignCode` at all — the
   * stamp always wins, so a customer who applied A, removed it and applied B is
   * decided by the stamp, not by this.
   *
   * Returns a CANDIDATE, never a decision. `RedemptionService.redeem` still
   * applies every eligibility, expiry and already-spent gate, so this cannot
   * grant anything redemption itself would refuse.
   */
  static async resolveCheckoutIntent(params: {
    userId: string;
    now?: Date;
  }): Promise<{ code: string; issuanceId: string; intentTargetId: string | null } | null> {
    if (!mongoose.Types.ObjectId.isValid(params.userId)) return null;
    const now = params.now ?? new Date();
    const cutoff = new Date(now.getTime() - this.CHECKOUT_INTENT_WINDOW_MS);

    try {
      const issuance = await RedeemableIssuance.findOne({
        userId: params.userId,
        status: "active",
        checkoutIntentAt: { $gte: cutoff },
      })
        .select("_id campaignId checkoutIntentAt checkoutIntentTargetId")
        .sort({ checkoutIntentAt: -1 })
        .lean();
      if (!issuance) return null;

      const campaign = await MonthlyEntryCampaign.findOne({ _id: issuance.campaignId }).select("code").lean();
      if (!campaign?.code) return null;

      return {
        code: campaign.code,
        issuanceId: String(issuance._id),
        intentTargetId: issuance.checkoutIntentTargetId ?? null,
      };
    } catch (error) {
      console.error("[campaign-code] checkout-intent lookup failed — no recovery this time", {
        userId: params.userId,
        error,
      });
      return null;
    }
  }
}
