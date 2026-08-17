import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  brand: string;
  stock: number;
  rating: number;
  reviews: {
    userId: mongoose.Types.ObjectId;
    rating: number;
    comment: string;
    createdAt: Date;
  }[];
  features: string[];
  specifications: Record<string, string>;
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
  variants: {
    sku: string;
    size?: string;
    colour?: string;
    /** Print-provider blank identifier. Undefined until the supplier gives us one. */
    gtin?: string;
    isActive: boolean;
  }[];
  /**
   * Free entries included with this item. 0 = none.
   * Authored per product and deliberately independent of `price` — publishing a
   * dollar-to-entry ratio is prohibited (CLAUDE.md rule 11). Nothing grants from
   * this yet; see docs/superpowers/specs/2026-08-17-shop-entries-design.md.
   */
  includedEntries: number;
  printArtwork: {
    url: string;
    /** Print-provider placement id — "1" Front, "2" Back, "3" Left Chest. */
    placement: string;
    type: "printing" | "mockup";
  }[];
  /** false for print-to-order items. Existing stocked products keep true. */
  trackInventory: boolean;
  /** Reserved: which origin ships this. Merch ships from the printer, not our VIC store. */
  originLocation?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot be more than 200 characters'],
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    maxlength: [2000, 'Product description cannot be more than 2000 characters'],
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative'],
  },
  images: [{
    type: String,
    required: [true, 'At least one image is required'],
  }],
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true,
  },
  brand: {
    type: String,
    required: [true, 'Product brand is required'],
    trim: true,
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0,
  },
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot be more than 5'],
  },
  reviews: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Review comment cannot be more than 500 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  features: [{
    type: String,
    trim: true,
  }],
  specifications: {
    type: Map,
    of: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  variants: [{
    sku: { type: String, required: true, trim: true },
    size: { type: String, trim: true },
    colour: { type: String, trim: true },
    gtin: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  }],
  includedEntries: {
    type: Number,
    default: 0,
    min: [0, 'Included entries cannot be negative'],
  },
  printArtwork: [{
    url: { type: String, required: true, trim: true },
    placement: { type: String, required: true, trim: true },
    type: { type: String, enum: ['printing', 'mockup'], required: true },
  }],
  trackInventory: {
    type: Boolean,
    default: true,
  },
  originLocation: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
ProductSchema.index({ name: 'text', description: 'text', brand: 'text' });
ProductSchema.index({ category: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ rating: -1 });
ProductSchema.index({ isActive: 1, isFeatured: 1 });
ProductSchema.index({ tags: 1 });

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);