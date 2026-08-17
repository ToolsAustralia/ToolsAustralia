// src/services/admin/receipts.ts
//
// The admin Receipts ledger: one row per payment received, newest first, across every
// revenue source — memberships, one-time and additional packs, mini draws, upsells, and
// shop orders — joined to the customer who paid and to Stripe.
//
// "Receipts" is a COINED name. `src/app/api/admin/invoices/` already exists and means
// something else entirely (past-due *charging actions*: charge-past-due, recover-past-due,
// recover-stranded), so a listing endpoint could not live there without forking the meaning
// of that folder.
//
// The pure half — categories, the classifier, the refund rule, the row DTOs, the CSV
// writer — lives in `src/utils/admin/receipts.ts` so the client can import it without
// pulling Mongoose into the browser bundle. This file is the data access.
//
// ─── How this differs from the dashboard's revenue slices ────────────────────────────────
//
// 1. REFUNDS ARE SHOWN, NOT DROPPED. `fetchNetBenefitsGrantedWithMatch`
//    (src/utils/payment/payment-event-net-queries.ts) excludes refunded rows outright
//    because the dashboard wants *net* revenue. A ledger has to show them, so this service
//    queries `PaymentEvent` directly and joins the refund rows back on `paymentIntentId`.
//    Each row carries its gross, what came back, and the net; the filter total is net of
//    refunds and is labelled as such in the UI.
//
// 2. RENEWALS ARE INCLUDED, where the dashboard's acquisition revenue excludes them.
//    See `classifyReceiptCategory`. That one difference is the entire expected delta when
//    reconciling against the dashboard (`npm run verify:receipts-reconciliation`).

import { type PipelineStage } from "mongoose";
import PaymentEvent from "@/models/PaymentEvent";
import Order from "@/models/Order";
import User from "@/models/User";
import {
  buildReceiptsCsv,
  classifyReceiptCategory,
  deriveReceiptRefund,
  RECEIPT_CATEGORY_LABELS,
  roundCurrency,
  type ReceiptCategory,
  type ReceiptRefundIndex,
  type ReceiptRefundRecord,
  type ReceiptRow,
  type ReceiptSource,
  type ReceiptsData,
} from "@/utils/admin/receipts";
import {
  normalizeStripeObjectId,
  resolveStripeDashboardMode,
  stripeDashboardUrl,
} from "@/utils/billing/stripeDashboardUrl";

/** Mongoose pluralises `Order` to this collection; `$unionWith` needs the raw name. */
const ORDERS_COLLECTION = "orders";

/**
 * Stages legal inside `$unionWith`. Mongo forbids the stages that write (`$merge`, `$out`)
 * in a sub-pipeline, and Mongoose's types enforce it — so the order stages are typed to the
 * narrower set rather than cast past the check.
 */
type UnionablePipelineStage = Exclude<PipelineStage, PipelineStage.Merge | PipelineStage.Out>;

export const RECEIPTS_DEFAULT_LIMIT = 50;
export const RECEIPTS_MAX_LIMIT = 200;
/** Hard ceiling on a CSV export. Surfaced to the caller as `truncated` — never silent. */
export const RECEIPTS_EXPORT_MAX_ROWS = 10_000;

export interface ReceiptsInput {
  startDate: Date;
  endDate: Date;
  /** Omit for every category. */
  category?: ReceiptCategory;
  page: number;
  limit: number;
}

/** `PaymentEvent.packageType` enum, in full. */
const PAYMENT_EVENT_PACKAGE_TYPES = ["membership", "one-time", "mini-draw", "upsell"];

/**
 * Mongo clause for one category — the query-side twin of `classifyReceiptCategory`.
 *
 * The unfiltered branch pins `packageType` to the model enum on purpose: it makes "rows the
 * query returns" and "rows the classifier can label" the same set by construction, so the
 * totals can never drift from the listed rows. A future `packageType` would be excluded
 * from both, visibly, rather than silently mis-bucketed into one.
 */
function paymentEventCategoryClause(category?: ReceiptCategory): Record<string, unknown> {
  switch (category) {
    case "membership-purchase":
      return { packageType: "membership", "data.billingReason": { $ne: "subscription_cycle" } };
    case "membership-renewal":
      return { packageType: "membership", "data.billingReason": "subscription_cycle" };
    // `$not` also matches documents with no `packageId` at all, which is exactly what
    // `(packageId ?? "").startsWith("additional-") === false` means in the classifier.
    case "one-time-purchase":
      return { packageType: "one-time", packageId: { $not: /^additional-/ } };
    case "additional-one-time":
      return { packageType: "one-time", packageId: /^additional-/ };
    case "mini-draw":
      return { packageType: "mini-draw" };
    case "upsell":
      return { packageType: "upsell" };
    default:
      return { packageType: { $in: PAYMENT_EVENT_PACKAGE_TYPES } };
  }
}

/** BenefitsGranted rows in range, normalised into the shared row shape. */
function paymentEventStages(
  startDate: Date,
  endDate: Date,
  category?: ReceiptCategory
): PipelineStage[] {
  return [
    {
      $match: {
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
        ...paymentEventCategoryClause(category),
      },
    },
    {
      $project: {
        _id: 1,
        source: { $literal: "payment-event" },
        userId: 1,
        timestamp: 1,
        packageType: 1,
        packageId: 1,
        packageName: 1,
        billingReason: "$data.billingReason",
        amount: { $ifNull: ["$data.price", 0] },
        paymentIntentId: 1,
        orderNumber: { $literal: null },
      },
    },
  ];
}

/**
 * Shop orders in range, normalised into the same shape.
 *
 * ⚠️ EXPECT ZERO ROWS TODAY — verified against production on 2026-08-17: the `orders`
 * collection holds 0 documents. BUSINESS.md records the shop as scaffolded (the page renders
 * "Coming Soon"). This mapping is here so Receipts works on launch day instead of needing a
 * rework; an empty "Shop order" filter is NOT a bug to chase.
 *
 * `Order.tickets[]` and `Order.membership` are vestigial: `createOrderSchema`
 * (src/app/api/orders/route.ts) accepts only products / shippingAddress / paymentIntentId,
 * and that route is the ONLY writer of `Order` in the codebase. So an Order is always a
 * shop-product order, and unioning it with `PaymentEvent` cannot double-count.
 *
 * A `cancelled` order is a voided sale rather than money received, so it is excluded; every
 * other status (pending → completed) reflects a captured payment.
 */
function orderStages(startDate: Date, endDate: Date): UnionablePipelineStage[] {
  return [
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $ne: "cancelled" },
      },
    },
    {
      $project: {
        _id: 1,
        source: { $literal: "order" },
        userId: "$user",
        timestamp: "$createdAt",
        packageType: { $literal: null },
        packageId: { $literal: null },
        packageName: { $literal: null },
        billingReason: { $literal: null },
        amount: { $ifNull: ["$totalAmount", 0] },
        paymentIntentId: 1,
        orderNumber: 1,
      },
    },
  ];
}

/**
 * Every refund on the ledger, keyed by `paymentIntentId`.
 *
 * Loaded whole rather than scoped to the page because a refund can land long after the
 * payment, so a date-scoped read would miss the ones that matter. It stays cheap because
 * refunds are rare: 198 `RefundProcessed` and 0 `RefundPartial` against 36,790 payments in
 * production (2026-08-17). If that ratio ever changes materially, the fix is an index on
 * `{ eventType: 1 }` — this read currently filters on a non-prefix field.
 *
 * A full refund outranks a partial one for the same payment: `RefundProcessed` means the
 * whole grant was reversed, so there is nothing left for a partial to reduce.
 */
async function loadRefundIndex(): Promise<ReceiptRefundIndex> {
  const rows = await PaymentEvent.find({ eventType: { $in: ["RefundProcessed", "RefundPartial"] } })
    .select("paymentIntentId eventType timestamp data.refundAmount")
    .lean();

  const index: ReceiptRefundIndex = new Map();
  for (const row of rows) {
    const paymentIntentId = typeof row.paymentIntentId === "string" ? row.paymentIntentId : "";
    if (!paymentIntentId) continue;

    const kind: ReceiptRefundRecord["kind"] = row.eventType === "RefundProcessed" ? "full" : "partial";
    const existing = index.get(paymentIntentId);
    if (existing?.kind === "full" && kind === "partial") continue;

    const refundAmount = (row.data as { refundAmount?: unknown } | undefined)?.refundAmount;
    index.set(paymentIntentId, {
      kind,
      amountCents: typeof refundAmount === "number" ? refundAmount : 0,
      at: row.timestamp ? new Date(row.timestamp).toISOString() : null,
    });
  }
  return index;
}

/** Shape the aggregation emits, before refund marking and user hydration. */
interface RawReceiptDoc {
  _id: unknown;
  source: ReceiptSource;
  userId?: unknown;
  timestamp?: Date;
  packageType?: string | null;
  packageId?: string | null;
  packageName?: string | null;
  billingReason?: string | null;
  amount?: number;
  paymentIntentId?: string | null;
  orderNumber?: string | null;
}

interface ReceiptsFacet {
  rows: RawReceiptDoc[];
  totals: Array<{ gross: number; count: number }>;
  /** Only the in-range rows whose payment has a refund — at most a few hundred docs. */
  refunded: Array<{ paymentIntentId?: string | null; amount?: number }>;
}

/**
 * One page of the ledger plus the totals for the WHOLE filter.
 *
 * Rows, totals and the refunded subset all come out of a single `$facet` pipeline, and the
 * refund arithmetic for all three runs through the one `deriveReceiptRefund` function — so
 * the figure on the summary card cannot disagree with the rows beneath it.
 */
export async function getReceipts(input: ReceiptsInput): Promise<ReceiptsData> {
  const { startDate, endDate, category, page, limit } = input;
  const skip = (page - 1) * limit;

  const refundIndex = await loadRefundIndex();
  const refundedIds = [...refundIndex.keys()];

  const tail: PipelineStage[] = [
    // `_id` breaks ties so paging stays stable when several payments share a timestamp.
    { $sort: { timestamp: -1, _id: -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }],
        totals: [{ $group: { _id: null, gross: { $sum: "$amount" }, count: { $sum: 1 } } }],
        refunded: [
          { $match: { paymentIntentId: { $in: refundedIds } } },
          { $project: { _id: 0, paymentIntentId: 1, amount: 1 } },
        ],
      },
    },
  ];

  // Shop-only reads from `orders` directly; every other filter reads from `paymentevents`
  // and unions the shop in when no category is selected.
  const facets: ReceiptsFacet[] =
    category === "shop-order"
      ? await Order.aggregate([...orderStages(startDate, endDate), ...tail])
          .allowDiskUse(true)
          .exec()
      : await PaymentEvent.aggregate([
          ...paymentEventStages(startDate, endDate, category),
          ...(category
            ? []
            : [
                {
                  $unionWith: {
                    coll: ORDERS_COLLECTION,
                    pipeline: orderStages(startDate, endDate),
                  },
                },
              ]),
          ...tail,
        ])
          .allowDiskUse(true)
          .exec();

  const facet = facets[0];
  const rawRows = facet?.rows ?? [];
  const gross = facet?.totals?.[0]?.gross ?? 0;
  const totalCount = facet?.totals?.[0]?.count ?? 0;

  // Same rule as the rows use, applied to every refunded row inside the filter.
  let refundedTotal = 0;
  for (const row of facet?.refunded ?? []) {
    refundedTotal += deriveReceiptRefund(
      row.amount ?? 0,
      row.paymentIntentId,
      refundIndex
    ).refundedAmount;
  }

  // Explicit include-list. An unprojected `.find()` on User once shipped MB-scale
  // `entries[]` arrays to the client (2026-07 perf audit) — never widen this.
  const userIds = [...new Set(rawRows.map((r) => r.userId?.toString()).filter(Boolean))] as string[];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select("firstName lastName email stripeCustomerId")
        .lean()
    : [];
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  const stripeMode = resolveStripeDashboardMode();

  const rows: ReceiptRow[] = [];
  for (const raw of rawRows) {
    const rowCategory =
      raw.source === "order"
        ? ("shop-order" as const)
        : classifyReceiptCategory({
            packageType: raw.packageType,
            packageId: raw.packageId,
            billingReason: raw.billingReason,
          });
    // Unreachable while `packageType` stays enum-constrained (see paymentEventCategoryClause).
    if (!rowCategory) continue;

    const userId = raw.userId?.toString() || null;
    const user = userId ? userById.get(userId) : undefined;
    const objectId = raw.paymentIntentId?.trim() || null;
    const stripeCustomerId = (user?.stripeCustomerId as string | undefined)?.trim() || null;
    const amount = roundCurrency(raw.amount ?? 0);
    const refund = deriveReceiptRefund(amount, objectId, refundIndex);

    rows.push({
      id: String(raw._id),
      source: raw.source,
      timestamp: raw.timestamp ? new Date(raw.timestamp).toISOString() : "",
      category: rowCategory,
      packageName:
        raw.source === "order"
          ? raw.orderNumber
            ? `Order ${raw.orderNumber}`
            : "Shop order"
          : raw.packageName?.trim() || raw.packageId?.trim() || RECEIPT_CATEGORY_LABELS[rowCategory],
      amount,
      refundStatus: refund.refundStatus,
      refundedAmount: refund.refundedAmount,
      netAmount: refund.netAmount,
      refundedAt: refund.refundedAt,
      customer: {
        userId,
        firstName: (user?.firstName as string | undefined) ?? "",
        lastName: (user?.lastName as string | undefined) ?? "",
        email: (user?.email as string | undefined) ?? "",
      },
      stripe: {
        objectId,
        objectLabel: objectId ? normalizeStripeObjectId(objectId) : null,
        objectUrl: stripeDashboardUrl(objectId, stripeMode),
        customerId: stripeCustomerId,
        customerUrl: stripeDashboardUrl(stripeCustomerId, stripeMode),
      },
    });
  }

  const totalPages = limit > 0 ? Math.ceil(totalCount / limit) : 0;

  return {
    rows,
    totals: {
      gross: roundCurrency(gross),
      refunded: roundCurrency(refundedTotal),
      net: roundCurrency(gross - refundedTotal),
      count: totalCount,
    },
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    stripeMode,
  };
}

export interface ReceiptsExport {
  csv: string;
  rowCount: number;
  totalCount: number;
  /** True when the filter held more rows than `RECEIPTS_EXPORT_MAX_ROWS`. Surface it. */
  truncated: boolean;
}

/** The whole filter as CSV, capped — and honest about the cap. */
export async function getReceiptsExport(
  input: Omit<ReceiptsInput, "page" | "limit">
): Promise<ReceiptsExport> {
  const data = await getReceipts({ ...input, page: 1, limit: RECEIPTS_EXPORT_MAX_ROWS });
  return {
    csv: buildReceiptsCsv(data.rows),
    rowCount: data.rows.length,
    totalCount: data.pagination.totalCount,
    truncated: data.pagination.totalCount > data.rows.length,
  };
}
