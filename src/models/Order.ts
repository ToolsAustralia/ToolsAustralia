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
OrderSchema.index({ paymentIntentId: 1 }, { sparse: true });
// UNIQUE + sparse: the duplicate-print guard. The print provider has no
// idempotency keys, so if a submission times out and we retry, this index is
// what stops two provider orders — two physical garments, billed twice — being
// recorded against one order. Sparse so unsubmitted orders don't collide on null.
OrderSchema.index({ printProviderOrderId: 1 }, { unique: true, sparse: true });

export default mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
