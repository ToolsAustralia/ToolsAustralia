import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
  orderNumber: string;
  user: mongoose.Types.ObjectId;
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
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "completed";
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
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
      required: true,
    },
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
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "completed"],
      default: "pending",
    },
    shippingAddress: {
      firstName: {
        type: String,
        trim: true,
      },
      lastName: {
        type: String,
        trim: true,
      },
      address: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      postalCode: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        trim: true,
        default: "Australia",
      },
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

// Indexes for better query performance
// Note: orderNumber index is automatically created due to unique: true
OrderSchema.index({ user: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ paymentIntentId: 1 }, { sparse: true });

export default mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
