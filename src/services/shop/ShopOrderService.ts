import mongoose from "mongoose";
import Product from "@/models/Product";
import Order, { type IOrder } from "@/models/Order";
import { priceCart, dollarsToCents, centsToDollars, type CartLine } from "@/utils/shop/pricing";
import { findVariantBySku } from "@/utils/shop/variants";
import { PENDING_GRACE_MS } from "@/services/shop/orderQueries";

/**
 * Turning a cart into a payable order.
 *
 * The order is created `pending` BEFORE payment, from server-read prices, and the
 * Stripe webhook flips it to paid. Two reasons it works this way rather than the
 * webhook building the order from Stripe metadata:
 *
 *  - Stripe metadata caps at 500 chars per value, which caps cart size. The
 *    unmerged `claude/shop-setup` branch takes that approach and inherits the cap.
 *  - A pending order means a payment can always be reconciled to something. If the
 *    webhook is lost, the row still exists and an operator can see it.
 *
 * It is NOT a free-goods hole: the client never supplies a price, a total, or an
 * order. It sends product ids, variant skus and quantities; everything else is
 * read from the database here.
 */

export interface CheckoutLineInput {
  productId: string;
  sku?: string;
  quantity: number;
}

export interface ShippingAddressInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";
  postalCode: string;
  deliveryInstructions?: string;
}

export type CheckoutErrorReason =
  | "empty_cart"
  | "not_found"
  | "inactive"
  | "variant_required"
  | "variant_not_found"
  | "variant_inactive"
  | "insufficient_stock";

export interface CheckoutError {
  productId: string;
  reason: CheckoutErrorReason;
  /** Safe to show a customer — names the item and what to do. */
  message: string;
}

interface ResolvedLine extends CartLine {
  productId: mongoose.Types.ObjectId;
  sku?: string;
  name: string;
  /** Base free entries for one unit, read from the catalog and frozen onto the order. */
  includedEntries: number;
  /**
   * This product's own multiplier tier (a RATE, not a ceiling — see models/Product),
   * frozen with the rest of its snapshot. The fulfilment webhook never loads
   * products, so without carrying it here the per-product tier would show on the
   * page and never reach the grant.
   */
  entryMultiplier?: number | null;
  /** Category at purchase time — what the order lists filter on. */
  category: string;
  /** Variant labels at purchase time — what the customer actually chose. */
  size?: string;
  colour?: string;
}

/**
 * Structured errors rather than a thrown string: the checkout UI has to tell a
 * customer *which* item went wrong and why ("Only 2 of X left"), which a bare
 * throw cannot express.
 */
export class CheckoutValidationError extends Error {
  constructor(public readonly errors: CheckoutError[]) {
    super(errors[0]?.message ?? "Cart validation failed");
    this.name = "CheckoutValidationError";
  }
}

/**
 * `SHOP-20260817-4F7A2B`. Human-readable in a support conversation, sortable by
 * eye, and carries enough entropy that two orders in the same millisecond do not
 * collide — `orderNumber` is a unique index, so a collision is a hard failure.
 */
export function generateOrderNumber(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SHOP-${ymd}-${rand}`;
}

/**
 * Validate a cart against the catalog and resolve every price server-side.
 * Collects ALL errors rather than failing on the first, so a customer fixes one
 * cart rather than discovering problems one reload at a time.
 */
async function resolveLines(items: readonly CheckoutLineInput[]): Promise<ResolvedLine[]> {
  const errors: CheckoutError[] = [];
  const resolved: ResolvedLine[] = [];

  for (const item of items) {
    const product = await Product.findById(item.productId);

    if (!product) {
      errors.push({ productId: item.productId, reason: "not_found", message: "Product not found" });
      continue;
    }
    if (!product.isActive) {
      errors.push({
        productId: item.productId,
        reason: "inactive",
        message: `${product.name} is no longer available`,
      });
      continue;
    }

    const variants = product.variants ?? [];
    // Hoisted out of the validation block so the resolved line can snapshot the
    // variant's labels; a product with no variants leaves it undefined.
    let chosenVariant: { size?: string; colour?: string } | undefined;
    if (variants.length > 0) {
      if (!item.sku) {
        errors.push({
          productId: item.productId,
          reason: "variant_required",
          message: `Choose a size or colour for ${product.name}`,
        });
        continue;
      }
      const variant = findVariantBySku(variants, item.sku);
      if (!variant) {
        errors.push({
          productId: item.productId,
          reason: "variant_not_found",
          message: `That option for ${product.name} is no longer available`,
        });
        continue;
      }
      if (!variant.isActive) {
        errors.push({
          productId: item.productId,
          reason: "variant_inactive",
          message: `That option for ${product.name} is currently unavailable`,
        });
        continue;
      }
      chosenVariant = variant;
    }

    // Print-to-order items carry stock 0 permanently, so stock only gates a
    // product that actually tracks it.
    if (product.trackInventory && product.stock < item.quantity) {
      errors.push({
        productId: item.productId,
        reason: "insufficient_stock",
        message: `Only ${product.stock} of ${product.name} available`,
      });
      continue;
    }

    resolved.push({
      productId: product._id as mongoose.Types.ObjectId,
      sku: item.sku,
      name: product.name,
      // Price is read from the database, never from the request.
      priceCents: dollarsToCents(product.price),
      // Same rule for entries: the catalog decides, the client never asserts a
      // count. Frozen here so an admin edit between checkout and webhook cannot
      // change what this buyer was promised.
      includedEntries: product.includedEntries ?? 0,
      entryMultiplier: product.entryMultiplier ?? null,
      category: product.category ?? "",
      size: chosenVariant?.size,
      colour: chosenVariant?.colour,
      quantity: item.quantity,
    });
  }

  if (errors.length > 0) throw new CheckoutValidationError(errors);
  return resolved;
}

export interface CreatePendingOrderInput {
  userId: mongoose.Types.ObjectId | string;
  items: readonly CheckoutLineInput[];
  shippingAddress: ShippingAddressInput;
  /** Member tier shop discount: Tradie 5, Foreman 10, Boss 20. */
  shopDiscountPercent?: number;
}

export interface CreatePendingOrderResult {
  order: IOrder;
  totalCents: number;
}

export interface ResolvePendingOrderResult extends CreatePendingOrderResult {
  /**
   * True when an existing pending order was reused rather than a new one created.
   * The caller uses it to decide whether an existing PaymentIntent may be reused.
   */
  reused: boolean;
}

/**
 * Do two carts hold the same things?
 *
 * `(product, sku)` is ALREADY this codebase's definition of a cart line's identity —
 * declared on the cart subdocument in models/User.ts and relied on by the cart-clear
 * `$pull` in finalizeShopOrder — so this compares on the same triple rather than
 * inventing a cart hash and a schema field to store it in.
 *
 * Order-insensitive: the cart is a list, and two requests can serialise it differently
 * without the customer having changed anything.
 */
function sameLines(
  lines: readonly ResolvedLine[],
  products: IOrder["products"]
): boolean {
  if (lines.length !== products.length) return false;

  const key = (product: unknown, sku: string | undefined, quantity: number) =>
    `${String(product)}|${sku ?? ""}|${quantity}`;

  const remaining = new Map<string, number>();
  for (const p of products) {
    // `p.product` is an ObjectId on a freshly-read order and a populated doc only
    // where a route asked for it; this path never populates, so String() is exact.
    const k = key(p.product, p.sku, p.quantity);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }

  for (const l of lines) {
    const k = key(l.productId, l.sku, l.quantity);
    const n = remaining.get(k);
    if (!n) return false;
    if (n === 1) remaining.delete(k);
    else remaining.set(k, n - 1);
  }

  return remaining.size === 0;
}

export const ShopOrderService = {
  generateOrderNumber,

  /**
   * Reuse the caller's open pending order when it is for the same cart, or create one.
   *
   * WHY THIS EXISTS: every POST to /api/shop/checkout used to mint a new order, and the
   * Stripe idempotency key was derived from that brand-new order — so it was unique per
   * request by construction and could never deduplicate anything. A customer who
   * refreshed the page at the card step (the client holds clientSecret in React state
   * only, so a refresh drops it and re-enables the address form) got a second order and
   * a second PaymentIntent. That is not only dirty data: `markPaid` gates per-order, so
   * two intents that both confirmed would fulfil twice, decrement stock twice and grant
   * entries twice.
   *
   * The address is deliberately NOT part of the match. Shipping is flat and
   * address-independent, so editing an address cannot change the total, and a customer
   * who refreshed to FIX a typo should update their order rather than open a second one.
   */
  async resolvePendingOrder(input: CreatePendingOrderInput): Promise<ResolvePendingOrderResult> {
    if (input.items.length === 0) {
      throw new CheckoutValidationError([
        { productId: "", reason: "empty_cart", message: "Your cart is empty" },
      ]);
    }

    const lines = await resolveLines(input.items);
    const totals = priceCart(lines, { shopDiscountPercent: input.shopDiscountPercent ?? 0 });

    // Only inside the abandonment window. An older pending order is not a checkout
    // in progress, it is litter — the same threshold the customer's own order list
    // uses to stop showing it.
    const candidate = await Order.findOne({
      user: input.userId,
      status: "pending",
      createdAt: { $gte: new Date(Date.now() - PENDING_GRACE_MS) },
    }).sort({ createdAt: -1 });

    if (candidate) {
      // The total must match too: a member tier change or a catalogue price edit
      // between attempts changes what is owed, and a PaymentIntent already holds the
      // old amount.
      const sameTotal = dollarsToCents(candidate.totalAmount) === totals.totalCents;
      if (sameTotal && sameLines(lines, candidate.products)) {
        candidate.shippingAddress = { ...input.shippingAddress, country: "Australia" };
        await candidate.save();
        return { order: candidate, totalCents: totals.totalCents, reused: true };
      }

      // Different cart: the old attempt is superseded. Retire it so it stops
      // counting, rather than leaving a second open order behind.
      await this.abandonPendingOrder(candidate, "Abandoned checkout — superseded");
    }

    const created = await this.createPendingOrder(input);
    return { ...created, reused: false };
  },

  /**
   * Retire a pending order that will never be paid.
   *
   * `status: "pending"` in the FILTER is the race guard — it mirrors `markPaid`, so
   * this can never overwrite an order the webhook has already moved to `processing`.
   * The reason goes in `notes` because `cancelled` now covers three distinct causes
   * (stock loss, refund, and never-paid) and a human needs to tell them apart.
   */
  async abandonPendingOrder(order: IOrder, reason: string): Promise<void> {
    await Order.findOneAndUpdate(
      { _id: order._id, status: "pending" },
      { status: "cancelled", notes: reason }
    );
  },

  async createPendingOrder(input: CreatePendingOrderInput): Promise<CreatePendingOrderResult> {
    if (input.items.length === 0) {
      throw new CheckoutValidationError([
        { productId: "", reason: "empty_cart", message: "Your cart is empty" },
      ]);
    }

    const lines = await resolveLines(input.items);
    const totals = priceCart(lines, { shopDiscountPercent: input.shopDiscountPercent ?? 0 });

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      user: input.userId,
      products: lines.map((l) => ({
        product: l.productId,
        sku: l.sku,
        name: l.name,
        includedEntries: l.includedEntries,
        entryMultiplier: l.entryMultiplier,
        category: l.category,
        size: l.size,
        colour: l.colour,
        quantity: l.quantity,
        price: centsToDollars(l.priceCents),
      })),
      subtotal: centsToDollars(totals.subtotalCents),
      gstAmount: centsToDollars(totals.gstCents),
      shippingCost: centsToDollars(totals.shippingCents),
      totalAmount: centsToDollars(totals.totalCents),
      appliedDiscounts:
        totals.discountCents > 0
          ? [
              {
                type: "membership" as const,
                amount: centsToDollars(totals.discountCents),
                description: `Member shop discount (${input.shopDiscountPercent}%)`,
              },
            ]
          : [],
      status: "pending",
      shippingAddress: { ...input.shippingAddress, country: "Australia" },
    });

    return { order, totalCents: totals.totalCents };
  },

  /**
   * Mark a pending order paid. Idempotent by construction: the filter requires
   * `status: "pending"`, so a redelivered Stripe webhook updates nothing and
   * returns null rather than double-processing.
   */
  async markPaid(orderId: string, paymentIntentId: string): Promise<IOrder | null> {
    return Order.findOneAndUpdate(
      { _id: orderId, status: "pending" },
      { status: "processing", paymentIntentId },
      { new: true }
    );
  },

  /**
   * Decrement stock atomically for the stock-tracked lines of an order.
   *
   * `{ stock: { $gte: qty } }` in the FILTER is what makes this safe under
   * concurrency — two simultaneous buyers of the last unit cannot both succeed,
   * because the second one's filter no longer matches. A read-then-write would
   * oversell.
   *
   * Returns the lines it could not fulfil. The caller decides what to do (the
   * shop refunds and apologises); this function only reports.
   */
  async decrementStock(order: IOrder): Promise<{ failed: string[] }> {
    const applied: { productId: mongoose.Types.ObjectId; quantity: number }[] = [];
    const failed: string[] = [];

    for (const line of order.products) {
      const product = await Product.findById(line.product).select("trackInventory name");
      if (!product?.trackInventory) continue; // print-to-order — nothing to decrement

      const ok = await Product.findOneAndUpdate(
        { _id: line.product, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity } },
        { new: true }
      );

      if (ok) {
        applied.push({ productId: line.product, quantity: line.quantity });
      } else {
        failed.push(product.name);
      }
    }

    // Partial failure: put back what we took, so a refunded order does not also
    // leave phantom stock reserved against it.
    if (failed.length > 0) {
      for (const a of applied) {
        await Product.updateOne({ _id: a.productId }, { $inc: { stock: a.quantity } }).catch(
          (err) => console.error("[shop] stock revert failed", { productId: a.productId, err })
        );
      }
    }

    return { failed };
  },
};
