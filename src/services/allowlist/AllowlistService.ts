import type Stripe from "stripe";
import type { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import AllowlistAction from "@/models/AllowlistAction";
import BlockedTransaction from "@/models/BlockedTransaction";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import type {
  AllowlistRepository,
  ApplySource,
  BlockedFilter,
  BlockedListResult,
  BlockedPageResult,
  BlockedRow,
  EligibilityPreview,
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
 * Hard cap on the number of PaymentIntents the Stripe scan will iterate
 * before bailing out. Stripe's `paymentIntents.list` cannot filter by
 * outcome/status, so we paginate every PI in the date window — on a busy
 * account that's tens of thousands of records and easily blows the Vercel
 * function timeout. The cap keeps the worst case bounded; the admin UI
 * surfaces a "narrow your date range" notice when it's hit.
 */
const MAX_PAYMENT_INTENTS_SCANNED = 2000;

/** Default page size for `listBlocked`. */
const DEFAULT_LIST_BLOCKED_LIMIT = 50;
/** Hard upper bound for `listBlocked` page size — clamps any caller request. */
const MAX_LIST_BLOCKED_LIMIT = 100;

/**
 * PaymentEvent eventTypes that mean "user has successfully paid at least once."
 * Re-derived here (with identical values) from MongoAllowlistRepository's
 * SUCCEEDED_EVENT_TYPES so `listBlocked`'s batched paid-user lookup matches
 * the repo's single-user `userHasSucceededPayment` semantics. If you change
 * the success markers, update both lists in lockstep.
 */
// TODO(C-followup): extract to shared constants — duplicated in MongoAllowlistRepository.
const SUCCEEDED_EVENT_TYPES = [
  "PaymentProcessed",
  "BenefitsGranted",
  "SubscriptionActivated",
];

// ---------- listBlocked helpers ----------

export type CursorPayload = { createdAt: Date; _id: string };

export function encodeCursor(row: { createdAt: Date; _id: string }): string {
  return Buffer.from(
    JSON.stringify({ c: row.createdAt.toISOString(), i: row._id })
  ).toString("base64");
}

export function decodeCursor(s: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(s, "base64").toString()) as {
      c: string;
      i: string;
    };
    if (typeof parsed.c !== "string" || typeof parsed.i !== "string") return null;
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, _id: parsed.i };
  } catch {
    return null;
  }
}

/**
 * Lookup maps consumed by `computeEligibility`. The maps are the
 * already-fetched joins for a single page of `listBlocked` — we don't want
 * the verdict logic to issue further DB queries.
 */
export type EligibilityMaps = {
  userByCustomerId: Map<string, { _id: Types.ObjectId | string }>;
  userByEmail: Map<string, { _id: Types.ObjectId | string }>;
  paidUserIds: Set<string>;
};

/**
 * Pure verdict function — mirror of `AllowlistService.evaluate` but driven
 * by pre-fetched maps instead of new DB queries. Same order, same reasons:
 *   1. fraud signal decline-code check
 *   2. permanent issue decline-code check
 *   3. user lookup (stripeCustomerId, then email)
 *   4. has-paid check
 * Exported so Task C2 can unit-test the verdict logic against constructed
 * input. Keep these branches in lockstep with `evaluate`.
 */
export function computeEligibility(
  doc: {
    declineCode: string | null;
    stripeCustomerId: string | null;
    customerEmail: string | null;
  },
  maps: EligibilityMaps
): EligibilityPreview {
  if (isFraudSignalDeclineCode(doc.declineCode)) {
    return { eligible: false, reason: "filter_fraud_signal" };
  }
  if (isPermanentIssueDeclineCode(doc.declineCode)) {
    return { eligible: false, reason: "filter_permanent_issue" };
  }
  let user: { _id: Types.ObjectId | string } | undefined;
  if (doc.stripeCustomerId) user = maps.userByCustomerId.get(doc.stripeCustomerId);
  if (!user && doc.customerEmail) user = maps.userByEmail.get(doc.customerEmail);
  if (!user) return { eligible: false, reason: "filter_not_member" };
  if (!maps.paidUserIds.has(String(user._id))) {
    return { eligible: false, reason: "filter_not_member" };
  }
  return { eligible: true };
}

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

  async listBlockedFromStripe(filter: BlockedFilter): Promise<BlockedListResult> {
    if (!this.stripeClient) {
      throw new Error(
        "listBlockedFromStripe requires a full Stripe client; was not provided in deps"
      );
    }

    // Stripe's paymentIntents.list does not accept an outcome filter directly,
    // so we paginate failed PIs in the date range and filter client-side by
    // outcome.type === "blocked" or outcome.network_status === "declined_by_network".
    // Bounded by MAX_PAYMENT_INTENTS_SCANNED so a busy account can't time out
    // the request — see the constant's docblock for context.
    const collected: Stripe.PaymentIntent[] = [];
    let scanned = 0;
    let truncated = false;
    for await (const pi of this.stripeClient.paymentIntents.list({
      created: {
        gte: Math.floor(filter.dateFrom.getTime() / 1000),
        lte: Math.floor(filter.dateTo.getTime() / 1000),
      },
      limit: 100,
      expand: ["data.latest_charge"],
    })) {
      scanned += 1;
      if (scanned > MAX_PAYMENT_INTENTS_SCANNED) {
        truncated = true;
        break;
      }
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
    return { rows, truncated, scanned };
  }

  /**
   * Mongo-backed read path for the admin Blocked Transactions page. Replaces
   * `listBlockedFromStripe` (which paginates Stripe at request-time and
   * doesn't scale on busy accounts) with a cursor-paged read over the
   * `blockedtransactions` collection — populated by the
   * `payment_intent.payment_failed` webhook (Phase A) and the historical
   * backfill script (Phase B).
   *
   * Performance shape: 2 indexed Mongo queries for the page (count + find),
   * then a single User.find followed by 2 parallel batched lookups
   * (AllowlistAction by fingerprint, PaymentEvent.distinct by userId). Total
   * per page is bounded — does not depend on the size of the date window
   * like the Stripe path did.
   *
   * Filter semantics intentionally mirror `listBlockedFromStripe` so the UI
   * sees identical row counts during the migration period. Phase C3+ swap
   * the route to call this method instead.
   */
  async listBlocked(
    filter: BlockedFilter,
    opts?: { cursor?: string | null; limit?: number }
  ): Promise<BlockedPageResult> {
    const requestedLimit = opts?.limit ?? DEFAULT_LIST_BLOCKED_LIMIT;
    const limit = Math.max(
      1,
      Math.min(MAX_LIST_BLOCKED_LIMIT, Math.floor(requestedLimit) || DEFAULT_LIST_BLOCKED_LIMIT)
    );

    // Date-range + decline-code filter pushed into the Mongo query.
    // The `{ createdAt: -1 }` index covers the date range; combined with
    // `_id` for tie-breaking we get a stable sort for cursor pagination.
    const baseFilter: Record<string, unknown> = {
      createdAt: { $gte: filter.dateFrom, $lte: filter.dateTo },
    };

    // Decline-code filter — replicates the in-memory filter from
    // listBlockedFromStripe, but as a Mongo predicate so we don't fetch
    // rows we'll immediately discard.
    const fraudCodes = Array.from(FRAUD_SIGNAL_DECLINE_CODES);
    const permanentCodes = Array.from(PERMANENT_ISSUE_DECLINE_CODES);
    if (filter.declineReason === "recoverable_only") {
      baseFilter.declineCode = { $nin: [...fraudCodes, ...permanentCodes] };
    } else if (filter.declineReason === "transient_only") {
      baseFilter.declineCode = { $nin: fraudCodes };
    } else if (filter.declineReason === "fraud_signals_only") {
      baseFilter.declineCode = { $in: fraudCodes };
    }

    // Cursor predicate — a row is "before" the cursor if its createdAt is
    // strictly less, OR createdAt equal AND _id strictly less. Combined
    // with `sort({ createdAt: -1, _id: -1 })` this yields stable pagination.
    const cursorRaw = opts?.cursor ?? null;
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    // `dbFilter`'s top-level `createdAt` and `$or` are AND-ed by Mongo:
    // (dateFrom <= createdAt <= dateTo) AND (cursor predicate).
    // Do NOT collapse — the date range bound IS preserved by the implicit AND.
    const dbFilter: Record<string, unknown> = cursor
      ? {
          ...baseFilter,
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
          ],
        }
      : baseFilter;

    // Total count uses the filter MINUS the cursor predicate — we want the
    // full filtered total for "Showing X of Y" UI, not the remaining count.
    const [rawTotal, rawDocs] = await Promise.all([
      BlockedTransaction.countDocuments(baseFilter),
      BlockedTransaction.find(dbFilter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean<
          Array<{
            _id: string;
            paymentIntentId: string;
            chargeId: string;
            cardFingerprint: string;
            cardLast4: string;
            cardBrand: string;
            stripeCustomerId: string | null;
            customerEmail: string | null;
            declineCode: string | null;
            failureCode: string | null;
            amount: number;
            currency: string;
            createdAt: Date;
          }>
        >(),
    ]);

    if (rawDocs.length === 0) {
      return { rows: [], nextCursor: null, total: rawTotal };
    }

    // Build dedup'd lookup keys for the three batched queries.
    const cardFingerprints = Array.from(
      new Set(rawDocs.map((d) => d.cardFingerprint).filter(Boolean))
    );
    const customerIds = Array.from(
      new Set(rawDocs.map((d) => d.stripeCustomerId).filter((v): v is string => Boolean(v)))
    );
    const emails = Array.from(
      new Set(rawDocs.map((d) => d.customerEmail).filter((v): v is string => Boolean(v)))
    );

    // Phase 1 (serial): fetch users — this is the gate to the paid-user
    // check, which needs user IDs. Running this once (instead of in two
    // parallel Promise.all branches) avoids a duplicate indexed query and
    // removes the theoretical consistency risk of two reads diverging.
    const users =
      customerIds.length || emails.length
        ? await User.find({
            $or: [
              ...(customerIds.length
                ? [{ stripeCustomerId: { $in: customerIds } }]
                : []),
              ...(emails.length ? [{ email: { $in: emails } }] : []),
            ],
          })
            .select("_id email stripeCustomerId")
            .lean<
              Array<{
                _id: Types.ObjectId | string;
                email: string | null;
                stripeCustomerId: string | null;
              }>
            >()
        : ([] as Array<{
            _id: Types.ObjectId | string;
            email: string | null;
            stripeCustomerId: string | null;
          }>);

    const userIds = users.map((u) => u._id);

    // Phase 2 (parallel): the two queries that depend on user-ids OR
    // fingerprints — independent of each other, so run together.
    const [allowlistedActions, paidUserIds] = await Promise.all([
      cardFingerprints.length
        ? AllowlistAction.find({
            cardFingerprint: { $in: cardFingerprints },
            action: "added",
          })
            .select("cardFingerprint")
            .lean<Array<{ cardFingerprint: string }>>()
        : Promise.resolve([] as Array<{ cardFingerprint: string }>),

      userIds.length === 0
        ? Promise.resolve(new Set<string>())
        : (async (): Promise<Set<string>> => {
            const distinctIds = await PaymentEvent.distinct("userId", {
              userId: { $in: userIds },
              eventType: { $in: SUCCEEDED_EVENT_TYPES },
            });
            return new Set((distinctIds as Array<Types.ObjectId | string>).map(String));
          })(),
    ]);

    // Build O(1) lookup maps from the result arrays.
    const userByCustomerId = new Map<string, { _id: Types.ObjectId | string }>();
    const userByEmail = new Map<string, { _id: Types.ObjectId | string }>();
    for (const u of users) {
      if (u.stripeCustomerId) userByCustomerId.set(u.stripeCustomerId, u);
      if (u.email) userByEmail.set(u.email, u);
    }
    const allowlistedSet = new Set<string>(
      allowlistedActions.map((a) => a.cardFingerprint)
    );

    const eligibilityMaps: EligibilityMaps = {
      userByCustomerId,
      userByEmail,
      paidUserIds,
    };

    const builtRows: BlockedRow[] = rawDocs.map((doc) => {
      const preview = computeEligibility(doc, eligibilityMaps);
      return {
        paymentIntentId: doc.paymentIntentId,
        chargeId: doc.chargeId,
        createdAt: doc.createdAt,
        amount: doc.amount,
        currency: doc.currency,
        cardFingerprint: doc.cardFingerprint,
        cardLast4: doc.cardLast4,
        cardBrand: doc.cardBrand,
        stripeCustomerId: doc.stripeCustomerId,
        customerEmail: doc.customerEmail,
        declineCode: doc.declineCode,
        failureCode: doc.failureCode,
        preview,
        alreadyAllowlisted: allowlistedSet.has(doc.cardFingerprint),
      };
    });

    // Member-status filter is in-memory because the verdict depends on
    // joins we already computed. Mirrors the negation logic in
    // listBlockedFromStripe so the two paths return matching counts.
    const filteredRows = builtRows.filter((r) => {
      if (filter.memberStatus === "has_paid") {
        return r.preview.eligible || r.preview.reason !== "filter_not_member";
      }
      if (filter.memberStatus === "never_paid") {
        return !r.preview.eligible && r.preview.reason === "filter_not_member";
      }
      return true;
    });

    // skippedOnly mirrors the listBlockedFromStripe behavior.
    const finalRows = filter.skippedOnly
      ? filteredRows.filter((r) => !r.preview.eligible)
      : filteredRows;

    // nextCursor encodes the LAST raw doc on the page (not the last filtered
    // row) because the cursor advances the underlying Mongo scan, not the
    // post-filter view. If a page is full but every row got dropped by the
    // member-status filter, the next call will pick up where the scan left off.
    const lastRaw = rawDocs[rawDocs.length - 1];
    const nextCursor =
      rawDocs.length === limit && lastRaw
        ? encodeCursor({ createdAt: lastRaw.createdAt, _id: lastRaw._id })
        : null;

    return { rows: finalRows, nextCursor, total: rawTotal };
  }
}
