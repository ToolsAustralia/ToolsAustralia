import mongoose, { type FilterQuery } from "mongoose";
import Order, { type IOrder } from "@/models/Order";
import { sendShopOrderShipped } from "@/services/shop/sendOrderShipped";

/**
 * Order listing — the ONE query used by both the customer's order history and the
 * admin order list.
 *
 * The two differ in exactly two ways: the customer's list is scoped to their own
 * `userId`, and the admin's carries staff-only fields on top of the same rows.
 * Everything else — filtering, sorting, paging, the summary shape — is identical, so
 * it lives here once rather than being written twice and drifting.
 *
 * Every staff-only field hangs off the single `isAdminSurface` flag AND is left out
 * of the projection entirely on the customer path, so a field added for support
 * cannot reach a customer's own history through a later mapping mistake.
 *
 * SECURITY: `userId` is the only thing separating a customer's own history from
 * everyone's. Callers pass it from the session, never from a query parameter.
 */

export type OrderStatus = IOrder["status"];

export interface OrderListFilters {
  /** Scopes to one customer. Omit ONLY on an admin surface. */
  userId?: string;
  status?: OrderStatus;
  /**
   * Product category — "Apparel", or whatever the catalogue grows into. Matched
   * against the snapshot on the order line, so recategorising a product does not
   * retroactively move old orders between buckets.
   */
  category?: string;
  /** Order number or customer surname, case-insensitive. Admin surfaces only. */
  search?: string;
  page?: number;
  limit?: number;
}

/** One row in a list. Deliberately small — the detail view fetches the rest. */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  totalAmount: number;
  itemCount: number;
  /** Distinct categories on the order, so a row can be labelled without a join. */
  categories: string[];
  /** Present on admin rows; omitted on a customer's own list, where it is redundant. */
  customerName?: string;
  /**
   * Stripe's handle on the money for this order. Admin rows only — it is what lets
   * staff reconcile an order against a refund or a dispute in Stripe, which is the
   * only way to find a paid order that is stuck. A customer has no use for it.
   */
  paymentIntentId?: string;
  /**
   * Where the order is going. Admin rows only.
   *
   * Staff had only the customer's name, and the sole surface carrying a full
   * address was the fulfilment CSV — whose filter excludes anything already
   * stamped submitted. So the moment an order was handed to the printer, nobody
   * could answer "where was this sent?", which is most of what a delivery
   * enquiry is. Omitted entirely from a customer's own history, where they
   * supplied it and it is redundant.
   */
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    deliveryInstructions?: string;
  };
  entriesGranted?: number;
  submittedAt?: string;
  trackingNumber?: string;
  /**
   * Postage charged on this order, so a row's total reconciles with the lines
   * shown beside it.
   *
   * Without it a $158.90 basket posted for $9.95 renders as a $168.85 total over
   * a list of items that visibly sum to something else — which reads as an
   * overcharge, and arrives as a support enquiry. One scalar, not the whole money
   * breakdown: the rest is derivable and this is the only part the list needs.
   */
  shippingCost?: number;
  items: {
    name: string;
    sku?: string;
    /** "Black · L" — what the customer chose, built from the order-line snapshot. */
    variant?: string;
    quantity: number;
    price: number;
  }[];
}

export interface OrderListResult {
  orders: OrderListItem[];
  total: number;
  page: number;
  totalPages: number;
}

const MAX_LIMIT = 100;

/**
 * How long a `pending` order stays visible to the customer who created it.
 *
 * A real payment resolves in seconds; anything still pending after this was
 * abandoned at the card step. Long enough to cover a slow or retried Stripe
 * webhook, short enough that a stale attempt does not sit in someone's order
 * history looking like a second purchase.
 */
export const PENDING_GRACE_MS = 60 * 60 * 1000; // 1 hour

/**
 * The statuses that mean money actually changed hands.
 *
 * One name for one concept: this list was re-typed inline in at least three places
 * (review eligibility, refund eligibility, milestone spend) and every surface that
 * counts or sums orders needs it, because `pending` includes abandoned checkouts and
 * `cancelled` includes refunds. Anything reporting a COUNT or a TOTAL to a human
 * must filter on this, or it is reporting attempts as purchases.
 */
export const PAID_ORDER_STATUSES: readonly IOrder["status"][] = [
  "processing",
  "shipped",
  "delivered",
  "completed",
];

function buildFilter(f: OrderListFilters): FilterQuery<IOrder> {
  const query: FilterQuery<IOrder> = {};

  if (f.userId) {
    // An invalid id must match NOTHING rather than being dropped from the filter —
    // dropping it would widen a customer's own list to every order in the system.
    if (!mongoose.Types.ObjectId.isValid(f.userId)) {
      return { _id: { $exists: false } } as FilterQuery<IOrder>;
    }
    query.user = new mongoose.Types.ObjectId(f.userId);

    // Hide ABANDONED checkout attempts from the customer's own list.
    //
    // Every submit of the checkout address form creates a fresh pending order and
    // PaymentIntent. A customer who edits their address and resubmits, or who
    // backs out at the card step, leaves a pending order behind — permanently, on
    // a page headed "Everything you've bought from the shop", labelled "Awaiting
    // payment" with no way to resume it. One real purchase reads as two orders.
    //
    // Recent pending orders are still shown: a customer who has just paid should
    // see their order while the Stripe webhook is in flight, and if that webhook
    // never lands they need to see SOMETHING to contact support about rather than
    // a page saying they bought nothing.
    //
    // ADMIN IS UNAFFECTED — this branch only runs when a userId scopes the query,
    // and staff must keep seeing every pending order to reconcile stuck payments.
    const abandonedBefore = new Date(Date.now() - PENDING_GRACE_MS);
    query.$and = [
      ...(query.$and ?? []),
      {
        $or: [
          { status: { $ne: "pending" } },
          { createdAt: { $gte: abandonedBefore } },
        ],
      },
    ];
  }

  if (f.status) query.status = f.status;
  if (f.category) query["products.category"] = f.category;

  if (f.search?.trim()) {
    // Escaped: an unescaped user string in a regex is a ReDoS and a silent
    // wrong-results bug (a customer searching "SHOP-2026-08" would have "." and
    // "-" behave as metacharacters).
    const safe = f.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    query.$or = [
      { orderNumber: rx },
      { "shippingAddress.lastName": rx },
      { "shippingAddress.firstName": rx },
      { "shippingAddress.email": rx },
    ];
  }

  return query;
}

export async function listOrders(filters: OrderListFilters = {}): Promise<OrderListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? 20));
  const query = buildFilter(filters);

  // An unscoped list is the admin one. That asymmetry is the whole security
  // boundary here, so the staff-only fields below key off it rather than off
  // anything a caller could set independently.
  const isAdminSurface = !filters.userId;

  // Explicit include-list. An unprojected find() on this collection ships every
  // address and line on every row — the documented performance footgun in
  // CLAUDE.md, which once shipped MB-scale payloads.
  //
  // paymentIntentId is appended for staff only. It is not fetched at all on a
  // customer's own history, so it cannot leak there even if someone later adds it
  // to the unconditional half of the row mapping.
  const projection =
    "orderNumber status createdAt totalAmount shippingCost products.name products.sku products.size products.colour products.quantity products.price products.category shippingAddress.firstName shippingAddress.lastName entriesGranted submittedAt trackingNumber" +
    (isAdminSurface
      ? " paymentIntentId shippingAddress.email shippingAddress.phone shippingAddress.addressLine1 shippingAddress.addressLine2 shippingAddress.address shippingAddress.city shippingAddress.state shippingAddress.postalCode shippingAddress.deliveryInstructions"
      : "");

  const [docs, total] = await Promise.all([
    Order.find(query)
      .select(projection)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IOrder[]>(),
    Order.countDocuments(query),
  ]);

  const orders: OrderListItem[] = docs.map((o) => {
    const a = o.shippingAddress ?? {};
    return {
      id: String(o._id),
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)).toISOString(),
      totalAmount: o.totalAmount ?? 0,
      itemCount: (o.products ?? []).reduce((n, p) => n + (p.quantity ?? 0), 0),
      categories: [...new Set((o.products ?? []).map((p) => p.category).filter(Boolean) as string[])],
      ...(isAdminSurface
        ? {
            customerName: [a.firstName, a.lastName].filter(Boolean).join(" ") || undefined,
            paymentIntentId: o.paymentIntentId,
            shippingAddress: {
              firstName: a.firstName,
              lastName: a.lastName,
              email: a.email,
              phone: a.phone,
              // `address` is the deprecated single-line field. Older orders have
              // only that, so fall back to it rather than showing a blank line.
              addressLine1: a.addressLine1 ?? a.address,
              addressLine2: a.addressLine2,
              city: a.city,
              state: a.state,
              postalCode: a.postalCode,
              deliveryInstructions: a.deliveryInstructions,
            },
          }
        : {}),
      entriesGranted: o.entriesGranted,
      shippingCost: o.shippingCost,
      submittedAt: o.submittedAt ? new Date(o.submittedAt).toISOString() : undefined,
      trackingNumber: o.trackingNumber,
      items: (o.products ?? []).map((p) => ({
        name: p.name ?? "Item",
        sku: p.sku,
        // Colour before size reads the way a person says it: "Black · L".
        variant: [p.colour, p.size].filter(Boolean).join(" · ") || undefined,
        quantity: p.quantity,
        price: p.price,
      })),
    };
  });

  return { orders, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Categories that actually appear on orders — the admin list's filter options.
 *
 * Derived, not hard-coded, for the same reason the shop's facet rail is: today it
 * returns ["Apparel"], and if tools are ever stocked and sold it returns them too
 * with no code change. A hard-coded list would offer a filter that matches nothing.
 */
export async function distinctOrderCategories(): Promise<string[]> {
  const values = (await Order.distinct("products.category")) as (string | null)[];
  return values.filter((v): v is string => Boolean(v && v.trim())).sort();
}

/**
 * Set an order's tracking number and/or status.
 *
 * The CSV fulfilment path leaves this open: the print provider creates the label on
 * their side and nothing tells this database the parcel moved, so an order would sit
 * at `processing` forever and the customer would never be told it shipped.
 *
 * Setting a tracking number alone implies dispatch, so status follows automatically
 * unless the caller names one — a human who has just pasted a tracking number should
 * not have to remember a second field for the customer to see the right thing.
 *
 * Crossing INTO "shipped" is what tells the customer, so this is also where the
 * dispatch notice is sent from — see the transition guard below.
 */
export async function updateOrderFulfilment(
  orderId: string,
  patch: { status?: OrderStatus; trackingNumber?: string }
): Promise<{ id: string; status: OrderStatus; trackingNumber?: string } | null> {
  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;

  const update: Partial<Pick<IOrder, "status" | "trackingNumber">> = {};
  if (patch.trackingNumber !== undefined) update.trackingNumber = patch.trackingNumber.trim();
  if (patch.status) update.status = patch.status;

  // Tracking implies shipped -- but only from a state an order can legitimately
  // ship FROM, which cannot be known until the pre-image comes back. So the
  // implied transition is applied AFTER the read, below.
  //
  // The admin list renders the tracking input on every row, including `pending`
  // (unpaid) and `cancelled` (refunded) ones. Forcing either to `shipped` is
  // unrecoverable: markPaid matches on `pending`, so a pending order pushed to
  // shipped can never afterwards be marked paid by the webhook, and the customer
  // has paid for something the system will never fulfil.
  const CAN_SHIP_FROM: readonly OrderStatus[] = ["processing", "shipped"];
  const wantsImpliedShip = !patch.status && Boolean(patch.trackingNumber?.trim());

  // Returns the document as it was BEFORE the write, which is the only thing that
  // can tell a real dispatch from a re-save. `findOneAndUpdate` is atomic, so two
  // staff hitting "shipped" at once produce exactly one pre-image that was not
  // already shipped — and therefore exactly one email.
  const previous = await Order.findByIdAndUpdate(orderId, { $set: update }, { new: false })
    .select("status trackingNumber")
    .lean<{ _id: mongoose.Types.ObjectId; status: OrderStatus; trackingNumber?: string } | null>();

  if (!previous) return null;

  // Now the pre-image is known, apply the implied transition if it is legal. A
  // second write rather than a cleverer single one: the pre-image is what tells a
  // real dispatch from a re-save, and it is also what the email guard below reads.
  if (wantsImpliedShip && CAN_SHIP_FROM.includes(previous.status)) {
    update.status = "shipped";
    await Order.updateOne({ _id: orderId }, { $set: { status: "shipped" } });
  }

  const status = update.status ?? previous.status;
  const trackingNumber = update.trackingNumber ?? previous.trackingNumber;

  // Only on the TRANSITION. An order already at "shipped" is being re-saved or
  // having a mistyped tracking number corrected, and a customer must not be told
  // twice that the same parcel just left — the second email reads as a second
  // parcel. Awaited, not fired and forgotten: a serverless function that returns
  // can be frozen mid-send. It never throws, so the write's result still stands.
  // And only from a state a parcel can legitimately leave. Testing the VALUE
  // alone would email on illegal transitions: an order sits at "pending" before
  // payment, and a full refund sets "cancelled" -- so a mis-set status on either
  // would tell someone who has not paid, or who has just been refunded, that
  // their parcel is on its way.
  const DISPATCHABLE_FROM: readonly OrderStatus[] = ["processing"];
  if (
    status === "shipped" &&
    previous.status !== "shipped" &&
    DISPATCHABLE_FROM.includes(previous.status)
  ) {
    await sendShopOrderShipped(orderId);
  }

  return { id: String(previous._id), status, trackingNumber };
}
