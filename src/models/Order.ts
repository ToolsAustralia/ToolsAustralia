import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
  orderNumber: string;
  user: mongoose.Types.ObjectId;
  products: {
    product: mongoose.Types.ObjectId;
    /**
     * Chosen variant. Snapshotted so a later catalog edit cannot change what was
     * bought — and because the printer is told which size to make from this.
     */
    sku?: string;
    /** Snapshot of the product name at purchase time; the catalog may be renamed. */
    name?: string;
    /**
     * Free entries included with ONE unit of this line, snapshotted at checkout
     * for the same reason `price` is: an admin editing the catalog between
     * checkout and the webhook must not change what the customer was promised.
     * This is the BASE count — the promo multiplier is applied at fulfilment.
     */
    includedEntries?: number;
    /**
     * The product's own multiplier CEILING, frozen at checkout with the rest of
     * its snapshot. The webhook never loads products, so without this the
     * per-product tier would show on the page and quietly not reach the grant.
     * Category and shop-wide caps are config rather than product data and so
     * resolve live at webhook time, alongside the promo itself.
     */
    entryMultiplierCap?: number | null;
    /**
     * What the grant actually multiplied this line by. Per line, not per order:
     * a cart holding a capped tee beside an uncapped hoodie has no single
     * multiplier to record.
     */
    entryMultiplierApplied?: number;
    /**
     * Product category at purchase time — "Apparel", and whatever else the catalogue
     * grows into. Snapshotted for the same reason name and price are, plus one more:
     * it is what the order lists filter on, so a product being recategorised (or
     * deleted) must not retroactively rewrite which bucket an old order sits in.
     * Filtering through a join to Product would do exactly that.
     */
    category?: string;
    /**
     * Variant labels at purchase time. The sku identifies the variant but is an
     * internal string — "TEE-BLK-L" is not what the customer chose. Snapshotted so
     * a receipt, an order history row and the printer CSV can all say "Black · L"
     * without a join, and so a variant later removed from the catalogue does not
     * make an old order unreadable.
     */
    size?: string;
    colour?: string;
    quantity: number;
    price: number;
  }[];
  tickets: {
    miniDrawId: mongoose.Types.ObjectId;
    quantity: number;
    price: number;
  }[];
  membership?: {
    packageId: mongoose.Types.ObjectId;
    price: number;
  };
  totalAmount: number;
  appliedDiscounts: {
    type: "membership" | "partner" | "rewards";
    amount: number;
    description: string;
  }[];
  /** Money breakdown. Persist the composition, not just a single total. */
  subtotal: number;
  /** GST already INSIDE totalAmount — an Australian tax invoice must show it. */
  gstAmount: number;
  shippingCost: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "completed";
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    /** Legacy single-line address. Read-only fallback for pre-2026-08 orders. */
    address?: string;
    addressLine2?: string;
    /** Labelled "Suburb" in the UI. */
    city?: string;
    state?: "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";
    postalCode?: string;
    country?: string;
    deliveryInstructions?: string;
  };
  paymentIntentId?: string;
  trackingNumber?: string;
  /** Print-provider linkage — the duplicate-print guard. See spec 3. */
  printProviderOrderId?: string;
  printProviderStatus?: string;
  submittedAt?: Date;
  /**
   * Free entries actually credited for this order, AFTER the promo multiplier.
   * Written by the webhook once the grant lands.
   *
   * `undefined` and `0` mean different things and support will ask: `undefined`
   * is "the grant has not run" (in flight, or failed and awaiting the reconcile
   * cron); `0` is "it ran and this order was worth no entries" — which is the
   * normal state while the feature ships dark at `includedEntries: 0`.
   */
  entriesGranted?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    products: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        // Snapshots. A catalog rename or variant removal must not rewrite order
        // history, and the printer is told which size to make from `sku`.
        sku: { type: String, trim: true },
        name: { type: String, trim: true },
        // Base free-entry count for one unit, frozen at checkout. Not derived
        // from price — there is no dollar-to-entry rate in this system, by law
        // (CLAUDE.md rule 11).
        includedEntries: { type: Number, default: 0, min: 0 },
        // The product's own multiplier ceiling, frozen at checkout with the
        // rest of its snapshot. The webhook never loads products, so without
        // this the per-product tier would apply on the page and silently not
        // apply to the grant. The category and shop-wide caps are config, not
        // product data, and resolve live at webhook time alongside the promo.
        entryMultiplierCap: { type: Number, default: null, min: 1, max: 10 },
        // What the grant actually multiplied by, per line. Not order-level:
        // a cart holding a capped tee and an uncapped hoodie has no single
        // multiplier, and support needs to answer "why did this item give 3".
        entryMultiplierApplied: { type: Number, min: 0 },
        category: { type: String, trim: true },
        size: { type: String, trim: true },
        colour: { type: String, trim: true },
        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity must be at least 1"],
        },
        price: {
          type: Number,
          required: true,
          min: [0, "Price cannot be negative"],
        },
      },
    ],
    tickets: [
      {
        miniDrawId: {
          type: Schema.Types.ObjectId,
          ref: "MiniDraw",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity must be at least 1"],
        },
        price: {
          type: Number,
          required: true,
          min: [0, "Price cannot be negative"],
        },
      },
    ],
    membership: {
      packageId: {
        type: Schema.Types.ObjectId,
        ref: "MembershipPackage",
      },
      price: {
        type: Number,
        min: [0, "Price cannot be negative"],
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },
    appliedDiscounts: [
      {
        type: {
          type: String,
          enum: ["membership", "partner", "rewards"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          min: [0, "Discount amount cannot be negative"],
        },
        description: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "completed"],
      default: "pending",
    },
    // A real Australian delivery address. The single `address` line is kept as a
    // read-only fallback so pre-2026-08 orders still render, but nothing writes it.
    shippingAddress: {
      firstName: { type: String, trim: true },
      lastName: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      addressLine1: { type: String, trim: true },
      /** @deprecated legacy single-line address — read-only fallback. */
      address: { type: String, trim: true },
      addressLine2: { type: String, trim: true },
      /** Labelled "Suburb" in the UI. */
      city: { type: String, trim: true },
      // Enum, not a free string: a courier cannot deliver to "Vic." or "victoria",
      // and draw eligibility keys off SA/ACT so the value has to be comparable.
      state: {
        type: String,
        trim: true,
        uppercase: true,
        enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
      },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true, default: "Australia" },
      deliveryInstructions: { type: String, trim: true, maxlength: 280 },
    },
    subtotal: { type: Number, default: 0, min: [0, "Subtotal cannot be negative"] },
    gstAmount: { type: Number, default: 0, min: [0, "GST cannot be negative"] },
    shippingCost: { type: Number, default: 0, min: [0, "Shipping cannot be negative"] },
    paymentIntentId: {
      type: String,
      trim: true,
    },
    // Print-provider linkage. Unique + sparse is the duplicate-print guard: two
    // submissions of the same order cannot both persist a provider id.
    printProviderOrderId: { type: String, trim: true },
    printProviderStatus: { type: String, trim: true },
    submittedAt: { type: Date },
    // No `default: 0` on purpose — see IOrder: absent must stay distinguishable
    // from a granted zero, or a failed grant looks identical to a zero-entry order.
    entriesGranted: { type: Number, min: 0 },
    trackingNumber: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot be more than 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
// Note: orderNumber index is automatically created due to unique: true
OrderSchema.index({ user: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
// Backs the admin order list's category filter ("merch vs tools"), which queries
// products.category alongside a createdAt sort.
OrderSchema.index({ "products.category": 1, createdAt: -1 });
OrderSchema.index({ paymentIntentId: 1 }, { sparse: true });
// UNIQUE + sparse: the duplicate-print guard. The print provider has no
// idempotency keys, so if a submission times out and we retry, this index is
// what stops two provider orders — two physical garments, billed twice — being
// recorded against one order. Sparse so unsubmitted orders don't collide on null.
OrderSchema.index({ printProviderOrderId: 1 }, { unique: true, sparse: true });

export default mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
