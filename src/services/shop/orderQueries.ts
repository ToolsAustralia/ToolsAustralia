import mongoose, { type FilterQuery } from "mongoose";
import Order, { type IOrder } from "@/models/Order";

/**
 * Order listing — the ONE query used by both the customer's order history and the
 * admin order list.
 *
 * The two differ in exactly one way: the customer's list is scoped to their own
 * `userId`, the admin's is not. Everything else — filtering, sorting, paging, the
 * projection, the summary shape — is identical, so it lives here once rather than
 * being written twice and drifting. A projection that gains a field on one surface
 * and not the other is how support ends up seeing something the customer cannot.
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
  entriesGranted?: number;
  submittedAt?: string;
  trackingNumber?: string;
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

function buildFilter(f: OrderListFilters): FilterQuery<IOrder> {
  const query: FilterQuery<IOrder> = {};

  if (f.userId) {
    // An invalid id must match NOTHING rather than being dropped from the filter —
    // dropping it would widen a customer's own list to every order in the system.
    if (!mongoose.Types.ObjectId.isValid(f.userId)) {
      return { _id: { $exists: false } } as FilterQuery<IOrder>;
    }
    query.user = new mongoose.Types.ObjectId(f.userId);
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

  // Explicit include-list. An unprojected find() on this collection ships every
  // address and line on every row — the documented performance footgun in
  // CLAUDE.md, which once shipped MB-scale payloads.
  const [docs, total] = await Promise.all([
    Order.find(query)
      .select(
        "orderNumber status createdAt totalAmount products.name products.sku products.size products.colour products.quantity products.price products.category shippingAddress.firstName shippingAddress.lastName entriesGranted submittedAt trackingNumber"
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IOrder[]>(),
    Order.countDocuments(query),
  ]);

  const includeCustomer = !filters.userId;

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
      ...(includeCustomer
        ? { customerName: [a.firstName, a.lastName].filter(Boolean).join(" ") || undefined }
        : {}),
      entriesGranted: o.entriesGranted,
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
 */
export async function updateOrderFulfilment(
  orderId: string,
  patch: { status?: OrderStatus; trackingNumber?: string }
): Promise<{ id: string; status: OrderStatus; trackingNumber?: string } | null> {
  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;

  const update: Partial<Pick<IOrder, "status" | "trackingNumber">> = {};
  if (patch.trackingNumber !== undefined) update.trackingNumber = patch.trackingNumber.trim();
  if (patch.status) update.status = patch.status;

  // Tracking implies shipped, unless an explicit status says otherwise.
  if (!patch.status && patch.trackingNumber?.trim()) update.status = "shipped";

  const doc = await Order.findByIdAndUpdate(orderId, { $set: update }, { new: true })
    .select("status trackingNumber")
    .lean<{ _id: mongoose.Types.ObjectId; status: OrderStatus; trackingNumber?: string } | null>();

  return doc ? { id: String(doc._id), status: doc.status, trackingNumber: doc.trackingNumber } : null;
}
