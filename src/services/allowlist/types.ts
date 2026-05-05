import type { Types } from "mongoose";
import type { IAllowlistAction } from "@/models/AllowlistAction";

export type EvalInput = {
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  triggeringPaymentIntentId: string | null;
  triggeringChargeId: string | null;
};

export type EvalResult =
  | { eligible: true; userId: Types.ObjectId | null }
  | {
      eligible: false;
      reason: "filter_not_member" | "filter_fraud_signal" | "filter_permanent_issue";
    };

export type ApplySource = "webhook" | "admin_bulk";

export type BlockedFilter = {
  dateFrom: Date;
  dateTo: Date;
  memberStatus: "any" | "has_paid" | "never_paid";
  declineReason: "any" | "recoverable_only" | "transient_only" | "fraud_signals_only";
  skippedOnly: boolean;
};

export type EligibilityPreview =
  | { eligible: true }
  | {
      eligible: false;
      reason: "filter_not_member" | "filter_fraud_signal" | "filter_permanent_issue";
    };

export type BlockedRow = {
  paymentIntentId: string;
  chargeId: string;
  createdAt: Date;
  amount: number;
  currency: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  preview: EligibilityPreview;
  alreadyAllowlisted: boolean;
};

/**
 * Result envelope for `listBlockedFromStripe`. `truncated=true` means the
 * Stripe scan hit the safety cap before the date window was exhausted, so
 * `rows` may be incomplete — admins should narrow the date range.
 */
export type BlockedListResult = {
  rows: BlockedRow[];
  truncated: boolean;
  scanned: number;
};

/**
 * Result envelope for `listBlocked` (Mongo-backed read path). Replaces the
 * Stripe-paginate-at-request-time approach with a cursor-paged Mongo query
 * over the `blockedtransactions` collection.
 *
 * - `rows` — page of rows (size up to opts.limit).
 * - `nextCursor` — opaque cursor for the next page; null when no more results.
 * - `total` — total count of rows matching the filter (across all pages),
 *   used by the admin UI's "Showing X of Y" counter.
 */
export type BlockedPageResult = {
  rows: BlockedRow[];
  nextCursor: string | null;
  total: number;
};

/** Repository abstraction so the service can be tested with hand-rolled fakes. */
export interface AllowlistRepository {
  /** Returns the userId if either stripeCustomerId or customerEmail matches a User row. */
  findUserId(args: {
    stripeCustomerId: string | null;
    customerEmail: string | null;
  }): Promise<Types.ObjectId | null>;

  /** True if the user has at least one PaymentEvent with eventType in the success set. */
  userHasSucceededPayment(userId: Types.ObjectId): Promise<boolean>;

  /** Finds the most recent "added" AllowlistAction for a given card fingerprint, if any. */
  findActiveAddedActionByFingerprint(cardFingerprint: string): Promise<IAllowlistAction | null>;

  /** Finds an AllowlistAction by its _id. */
  findActionById(actionId: Types.ObjectId): Promise<IAllowlistAction | null>;

  /** Inserts a new AllowlistAction document. */
  insertAction(doc: Omit<IAllowlistAction, "_id" | "createdAt"> & { createdAt?: Date }): Promise<IAllowlistAction>;

  /** Returns the most recent N actions, optionally filtered by action kind. */
  listRecentActions(args: {
    limit: number;
    action: "added" | "skipped" | "removed" | "all";
  }): Promise<IAllowlistAction[]>;
}
