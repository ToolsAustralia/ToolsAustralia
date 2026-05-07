import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
  orderNumber: string;
  user?: mongoose.Types.ObjectId;
  guestEmail?: string;
  guestFirstName?: string;
  guestLastName?: string;
  products: {
    product: mongoose.Types.ObjectId;
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
  gstAmount: number;
  shippingCost: number;
  invoiceSentAt?: Date;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "completed";
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    address?: string;
    addressLine2?: string;
    city?: string;
    state?: "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";
    postalCode?: string;
    country?: string;
    deliveryInstructions?: string;
  };
  paymentIntentId?: string;
  trackingNumber?: string;
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
      required: false, // optional now — guest orders use guestEmail/guestFirstName/guestLastName
    },
    guestEmail: { type: String, trim: true, lowercase: true },
    guestFirstName: { type: String, trim: true },
    guestLastName: { type: String, trim: true },
    products: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
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
    gstAmount: {
      type: Number,
      required: false,
      default: 0,
      min: [0, "GST cannot be negative"],
    },
    shippingCost: {
      type: Number,
      required: false,
      default: 0,
      min: [0, "Shipping cannot be negative"],
    },
    invoiceSentAt: { type: Date },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "completed"],
      default: "pending",
    },
    shippingAddress: {
      firstName: { type: String, trim: true },
      lastName: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      addressLine1: { type: String, trim: true },
      address: { type: String, trim: true }, // legacy — read-only fallback during migration
      addressLine2: { type: String, trim: true },
      city: { type: String, trim: true }, // labeled "Suburb" in UI
      state: {
        type: String,
        enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
        trim: true,
        uppercase: true,
      },
      postalCode: {
        type: String,
        trim: true,
        match: [/^[0-9]{4}$/, "Australian postcode must be 4 digits"],
      },
      country: { type: String, trim: true, default: "Australia" },
      deliveryInstructions: { type: String, trim: true, maxlength: 500 },
    },
    paymentIntentId: {
      type: String,
      trim: true,
    },
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

OrderSchema.pre<IOrder>("validate", function (next) {
  const hasUser = !!this.user;
  const hasGuest = !!(this.guestEmail && this.guestFirstName && this.guestLastName);
  if (hasUser && hasGuest) {
    return next(new Error("Order cannot have both user and guest fields"));
  }
  if (!hasUser && !hasGuest) {
    return next(new Error("Order must have either user or guest fields"));
  }
  next();
});

// Indexes for better query performance
// Note: orderNumber index is automatically created due to unique: true
OrderSchema.index({ user: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ paymentIntentId: 1 }, { sparse: true, unique: true });
OrderSchema.index({ guestEmail: 1, createdAt: -1 }, { sparse: true });

export default mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
