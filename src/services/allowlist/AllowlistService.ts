import type Stripe from "stripe";
import type { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type {
  AllowlistRepository,
  ApplySource,
  BlockedFilter,
  BlockedRow,
  EvalInput,
  EvalResult,
} from "./types";
import {
  FRAUD_SIGNAL_DECLINE_CODES,
  PERMANENT_ISSUE_DECLINE_CODES,
  isFraudSignalDeclineCode,
  isPermanentIssueDeclineCode,
} from "./declineCodes";
import { getAllowCardFingerprintListId } from "./stripeListResolver";

/**
 * The Stripe SDK v18 does not export `Stripe.RadarResource`. We pull the
 * type directly from `Stripe["radar"]` so callers can pass `stripe.radar`.
 */
type StripeRadar = Stripe["radar"];

export type AllowlistServiceDeps = {
  repo: AllowlistRepository;
  stripeRadar: StripeRadar;
  /** Full Stripe client — needed for paymentIntents.list. Optional in tests
   *  that only exercise evaluate/apply/reverse. */
  stripeClient?: Stripe;
};

export class AllowlistService {
  private readonly repo: AllowlistRepository;
  // Used by apply() / reverse() in subsequent tasks (6 and 7).
  private readonly stripeRadar: StripeRadar;
  private readonly stripeClient: Stripe | null;

  constructor(deps: AllowlistServiceDeps) {
    this.repo = deps.repo;
    this.stripeRadar = deps.stripeRadar;
    this.stripeClient = deps.stripeClient ?? null;
  }

  async evaluate(input: EvalInput): Promise<EvalResult> {
    if (isFraudSignalDeclineCode(input.declineCode)) {
      return { eligible: false, reason: "filter_fraud_signal" };
    }
    if (isPermanentIssueDeclineCode(input.declineCode)) {
      return { eligible: false, reason: "filter_permanent_issue" };
    }

    const userId = await this.repo.findUserId({
      stripeCustomerId: input.stripeCustomerId,
      customerEmail: input.customerEmail,
    });
    if (!userId) {
      return { eligible: false, reason: "filter_not_member" };
    }

    const hasPaid = await this.repo.userHasSucceededPayment(userId);
    if (!hasPaid) {
      return { eligible: false, reason: "filter_not_member" };
    }

    return { eligible: true, userId };
  }

  async apply(
    input: EvalInput,
    source: ApplySource,
    performedByUserId: Types.ObjectId | null,
    allowOverride: boolean = false
  ): Promise<IAllowlistAction> {
    // Idempotency: if we've already added this fingerprint, return the existing row.
    const existing = await this.repo.findActiveAddedActionByFingerprint(input.cardFingerprint);
    if (existing) return existing;

    const evalResult = await this.evaluate(input);

    // Skip path: not eligible AND not an admin override.
    if (!evalResult.eligible && !(allowOverride && source === "admin_bulk")) {
      return this.repo.insertAction({
        cardFingerprint: input.cardFingerprint,
        cardLast4: input.cardLast4,
        cardBrand: input.cardBrand,
        stripeCustomerId: input.stripeCustomerId,
        userId: null,
        customerEmail: input.customerEmail,
        action: "skipped",
        reason: evalResult.reason,
        declineCode: input.declineCode,
        failureCode: input.failureCode,
        triggeringPaymentIntentId: input.triggeringPaymentIntentId,
        triggeringChargeId: input.triggeringChargeId,
        stripeListItemId: null,
        source,
        performedByUserId,
      } as never);
    }

    // Add path: call Stripe, write added row.
    const reason: IAllowlistAction["reason"] = !evalResult.eligible
      ? "manual_admin_override"
      : source === "admin_bulk"
      ? "manual_admin"
      : "auto_eligible";

    const userId = evalResult.eligible ? evalResult.userId : null;

    let stripeListItemId: string | null = null;
    try {
      const listId = await getAllowCardFingerprintListId(this.stripeRadar);
      const item = await this.stripeRadar.valueListItems.create({
        value_list: listId,
        value: input.cardFingerprint,
      });
      stripeListItemId = item.id;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "value_already_exists") {
        throw err;
      }
      // value_already_exists: treat as success, leave stripeListItemId null.
    }

    return this.repo.insertAction({
      cardFingerprint: input.cardFingerprint,
      cardLast4: input.cardLast4,
      cardBrand: input.cardBrand,
      stripeCustomerId: input.stripeCustomerId,
      userId,
      customerEmail: input.customerEmail,
      action: "added",
      reason,
      declineCode: input.declineCode,
      failureCode: input.failureCode,
      triggeringPaymentIntentId: input.triggeringPaymentIntentId,
      triggeringChargeId: input.triggeringChargeId,
      stripeListItemId,
      source,
      performedByUserId,
    } as never);
  }

  async reverse(
    actionId: Types.ObjectId,
    performedByUserId: Types.ObjectId
  ): Promise<IAllowlistAction> {
    const original = await this.repo.findActionById(actionId);
    if (!original) {
      throw new Error(`AllowlistAction not found: ${String(actionId)}`);
    }
    if (original.action !== "added") {
      throw new Error(
        `Cannot reverse a ${original.action} action; only 'added' actions are reversible`
      );
    }

    if (original.stripeListItemId) {
      try {
        await this.stripeRadar.valueListItems.del(original.stripeListItemId);
      } catch (err) {
        const status = (err as { statusCode?: number; status?: number } | null)?.statusCode
          ?? (err as { statusCode?: number; status?: number } | null)?.status;
        if (status !== 404) {
          throw err;
        }
        // 404: Stripe is already in desired state; record reversal anyway.
      }
    }

    return this.repo.insertAction({
      cardFingerprint: original.cardFingerprint,
      cardLast4: original.cardLast4,
      cardBrand: original.cardBrand,
      stripeCustomerId: original.stripeCustomerId,
      userId: original.userId,
      customerEmail: original.customerEmail,
      action: "removed",
      reason: "manual_reversal",
      declineCode: original.declineCode,
      failureCode: original.failureCode,
      triggeringPaymentIntentId: original.triggeringPaymentIntentId,
      triggeringChargeId: original.triggeringChargeId,
      stripeListItemId: original.stripeListItemId,
      source: "admin_reversal",
      performedByUserId,
    } as never);
  }

  async listBlockedFromStripe(filter: BlockedFilter): Promise<BlockedRow[]> {
    if (!this.stripeClient) {
      throw new Error(
        "listBlockedFromStripe requires a full Stripe client; was not provided in deps"
      );
    }

    // Stripe's paymentIntents.list does not accept an outcome filter directly,
    // so we paginate failed PIs in the date range and filter client-side by
    // outcome.type === "blocked" or outcome.network_status === "declined_by_network".
    const collected: Stripe.PaymentIntent[] = [];
    for await (const pi of this.stripeClient.paymentIntents.list({
      created: {
        gte: Math.floor(filter.dateFrom.getTime() / 1000),
        lte: Math.floor(filter.dateTo.getTime() / 1000),
      },
      limit: 100,
      expand: ["data.latest_charge"],
    })) {
      if (pi.status !== "requires_payment_method" && pi.status !== "canceled") continue;
      const charge =
        pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
      if (!charge) continue;
      const isBlocked =
        charge.outcome?.type === "blocked" ||
        charge.outcome?.network_status === "declined_by_network";
      if (!isBlocked) continue;
      collected.push(pi);
    }

    const rows: BlockedRow[] = [];
    for (const pi of collected) {
      const charge = pi.latest_charge as Stripe.Charge;
      const card = charge.payment_method_details?.card;
      if (!card?.fingerprint) continue;

      const stripeCustomerId =
        typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
      const customerEmail = pi.receipt_email ?? charge.billing_details?.email ?? null;
      const declineCode = pi.last_payment_error?.decline_code ?? null;
      const failureCode = pi.last_payment_error?.code ?? null;

      const evalResult = await this.evaluate({
        cardFingerprint: card.fingerprint,
        cardLast4: card.last4 ?? "",
        cardBrand: card.brand ?? "unknown",
        stripeCustomerId,
        customerEmail,
        declineCode,
        failureCode,
        triggeringPaymentIntentId: pi.id,
        triggeringChargeId: charge.id,
      });

      const existingAdded = await this.repo.findActiveAddedActionByFingerprint(card.fingerprint);

      // Apply admin-page filters
      if (
        filter.memberStatus === "has_paid" &&
        !evalResult.eligible &&
        evalResult.reason === "filter_not_member"
      )
        continue;
      if (
        filter.memberStatus === "never_paid" &&
        (evalResult.eligible || evalResult.reason !== "filter_not_member")
      )
        continue;
      if (
        filter.declineReason === "transient_only" &&
        declineCode &&
        FRAUD_SIGNAL_DECLINE_CODES.has(declineCode)
      )
        continue;
      if (
        filter.declineReason === "recoverable_only" &&
        declineCode &&
        (FRAUD_SIGNAL_DECLINE_CODES.has(declineCode) ||
          PERMANENT_ISSUE_DECLINE_CODES.has(declineCode))
      )
        continue;
      if (
        filter.declineReason === "fraud_signals_only" &&
        (!declineCode || !FRAUD_SIGNAL_DECLINE_CODES.has(declineCode))
      )
        continue;
      if (filter.skippedOnly && evalResult.eligible) continue;

      rows.push({
        paymentIntentId: pi.id,
        chargeId: charge.id,
        createdAt: new Date(pi.created * 1000),
        amount: pi.amount,
        currency: pi.currency,
        cardFingerprint: card.fingerprint,
        cardLast4: card.last4 ?? "",
        cardBrand: card.brand ?? "unknown",
        stripeCustomerId,
        customerEmail,
        declineCode,
        failureCode,
        preview: evalResult.eligible
          ? { eligible: true }
          : { eligible: false, reason: evalResult.reason },
        alreadyAllowlisted: Boolean(existingAdded),
      });
    }
    return rows;
  }
}
