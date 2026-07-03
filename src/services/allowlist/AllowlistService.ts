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
  BlockedPageResult,
  BlockedRow,
  EligibilityPreview,
  EvalInput,
  EvalResult,
} from "./types";
import {
  isFraudSignalDeclineCode,
  isPermanentIssueDeclineCode,
} from "./declineCodes";
import { getAllowCardFingerprintListId } from "./stripeListResolver";

/**
 * Escape regex specials so user input in the email filter behaves as a
 * substring match — not as a regex pattern that could match unintended rows.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
// TODO(allowlist): extract to shared constants — duplicated in MongoAllowlistRepository.
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
 * Exported so unit tests can exercise the verdict logic against constructed
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
};

export class AllowlistService {
  private readonly repo: AllowlistRepository;
  // Used by apply() / reverse().
  private readonly stripeRadar: StripeRadar;

  constructor(deps: AllowlistServiceDeps) {
    this.repo = deps.repo;
    this.stripeRadar = deps.stripeRadar;
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

  /**
   * Mongo-backed read path for the admin Blocked Transactions page. Reads
   * cursor-paginated rows from the `blockedtransactions` collection —
   * populated by the `payment_intent.payment_failed` webhook (Phase A) and
   * the historical backfill script (Phase B).
   *
   * Performance shape: 2 indexed Mongo queries for the page (count + find),
   * then a single User.find followed by 2 parallel batched lookups
   * (AllowlistAction by fingerprint, PaymentEvent.distinct by userId). Total
   * per page is bounded — does not depend on the size of the date window.
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

    const baseFilter: Record<string, unknown> = {
      createdAt: { $gte: filter.dateFrom, $lte: filter.dateTo },
    };

    // Email substring (case-insensitive). Empty/omitted = no filter.
    if (filter.email && filter.email.trim()) {
      baseFilter.customerEmail = {
        $regex: escapeRegex(filter.email.trim()),
        $options: "i",
      };
    }

    // Decline codes — pushed into Mongo as `$in`. Empty array = no filter.
    if (filter.declineCodes && filter.declineCodes.length > 0) {
      baseFilter.declineCode = { $in: filter.declineCodes };
    }

    const cursorRaw = opts?.cursor ?? null;
    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    const dbFilter: Record<string, unknown> = cursor
      ? {
          ...baseFilter,
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
          ],
        }
      : baseFilter;

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

    const cardFingerprints = Array.from(
      new Set(rawDocs.map((d) => d.cardFingerprint).filter(Boolean))
    );
    const customerIds = Array.from(
      new Set(rawDocs.map((d) => d.stripeCustomerId).filter((v): v is string => Boolean(v)))
    );
    const emails = Array.from(
      new Set(rawDocs.map((d) => d.customerEmail).filter((v): v is string => Boolean(v)))
    );

    const users =
      customerIds.length || emails.length
        ? await User.find({
            $or: [
              ...(customerIds.length ? [{ stripeCustomerId: { $in: customerIds } }] : []),
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

    // Lazy-import to keep utils → service direction one-way.
    const { computeEligibilityKind } = await import(
      "@/utils/admin/blockedTransactionEligibility"
    );

    const builtRows: BlockedRow[] = rawDocs.map((doc) => {
      const preview = computeEligibility(doc, eligibilityMaps);
      let resolvedUser: { _id: Types.ObjectId | string } | undefined;
      if (doc.stripeCustomerId) resolvedUser = userByCustomerId.get(doc.stripeCustomerId);
      if (!resolvedUser && doc.customerEmail) resolvedUser = userByEmail.get(doc.customerEmail);
      return {
        paymentIntentId: doc.paymentIntentId,
        chargeId: doc.chargeId,
        userId: resolvedUser ? String(resolvedUser._id) : null,
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

    // Eligibility post-filter — applied via the shared mapper so the UI badge
    // and this filter cannot disagree. Empty/omitted = no filter.
    const finalRows =
      filter.eligibility && filter.eligibility.length > 0
        ? builtRows.filter((row) => {
            const kind = computeEligibilityKind({
              alreadyAllowlisted: row.alreadyAllowlisted,
              preview: row.preview,
            });
            return filter.eligibility!.includes(kind);
          })
        : builtRows;

    const lastRaw = rawDocs[rawDocs.length - 1];
    const nextCursor =
      rawDocs.length === limit && lastRaw
        ? encodeCursor({ createdAt: lastRaw.createdAt, _id: lastRaw._id })
        : null;

    return { rows: finalRows, nextCursor, total: rawTotal };
  }

  /**
   * Read recent AllowlistAction rows (audit feed). Thin wrapper around the
   * repository's `listRecentActions` that returns plain objects with `_id`
   * stringified — safe to serialise from a route handler. Order is
   * `createdAt` descending; `limit` is clamped by the caller.
   *
   * Used by:
   *   - admin route `GET /api/admin/allowlist/actions`
   *   - Norm route `GET /api/internal/norm/v1/allowlist/actions`
   */
  async listActions(args: {
    limit: number;
    action: "added" | "skipped" | "removed" | "all";
  }): Promise<Array<Record<string, unknown>>> {
    const docs = await this.repo.listRecentActions(args);
    return docs.map((doc) => {
      const obj = doc.toObject ? doc.toObject() : (doc as unknown as Record<string, unknown>);
      return { ...obj, _id: String((obj as { _id: unknown })._id) };
    });
  }

  /**
   * Count of cards currently on the Stripe allowlist — defined as
   * fingerprints whose most-recent AllowlistAction has `action: "added"`.
   *
   * Source-of-truth note: Stripe's `card_fingerprint_allowlist` Radar value
   * list is the live allowlist; AllowlistAction is our audit log. This count
   * approximates the live list (drift is bounded by reverse() failures, which
   * are vanishingly rare in practice).
   *
   * Used by:
   *   - admin route `GET /api/admin/allowlist/stats`
   *   - Norm route `GET /api/internal/norm/v1/allowlist/stats`
   */
  async getStats(): Promise<{ totalActiveAllowlisted: number }> {
    const result = await AllowlistAction.aggregate<{
      totalActiveAllowlisted: number;
    }>([
      { $sort: { cardFingerprint: 1, createdAt: -1 } },
      { $group: { _id: "$cardFingerprint", latest: { $first: "$action" } } },
      { $match: { latest: "added" } },
      { $count: "totalActiveAllowlisted" },
    ]);
    return { totalActiveAllowlisted: result[0]?.totalActiveAllowlisted ?? 0 };
  }

  /**
   * True if this card fingerprint currently has an active "added" AllowlistAction
   * (i.e. it is on Stripe's allowlist). Read-only; used by the reconcile sweep to
   * count "already allowlisted" and skip a redundant apply().
   */
  async isAllowlisted(cardFingerprint: string): Promise<boolean> {
    const existing = await this.repo.findActiveAddedActionByFingerprint(cardFingerprint);
    return !!existing;
  }
}
