import mongoose, { Document, Schema } from 'mongoose';
import { SHOP_ENTRY_MULTIPLIER_MAX, SHOP_ENTRY_MULTIPLIER_MIN } from "@/utils/shop/entry-multiplier";

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
  /**
   * How many reviews this product has.
   *
   * Denormalised so a listing card can apply the same display gate as the
   * product page without the list query shipping every review body — and every
   * reviewer's user id — to the browser.
   *
   * ALWAYS written as `reviews.length` from the array a write returns, never
   * incremented. An earlier `reviewCount` was read by six paths and never
   * existed on the schema, so Mongoose dropped every write to it and it read 0
   * forever. Derived from the same array as `rating`, the two cannot disagree.
   */
  reviewCount: number;
  /**
   * The average and count of the reviews a customer actually SEES — those at or
   * above the four-star display floor.
   *
   * Separate from `rating`/`reviewCount`, which stay honest across every review
   * for admin and reporting. A listing card cannot compute this: the list query
   * deliberately does not carry review bodies, so without these two fields the
   * card printed the all-reviews average while the product page printed the
   * displayed one, and the same product showed 3.2 on the grid and 4.8 on its
   * own page.
   *
   * Written in the same recompute as `rating`, never incremented.
   */
  displayRating: number;
  displayReviewCount: number;
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
  /**
   * The entry multiplier for THIS product.
   *
   * MOST SPECIFIC WINS, and each tier is an absolute RATE:
   *
   *     product  ->  category  ->  whole shop  ->  1x
   *
   * `null`/absent means "no opinion" and falls through to the next tier.
   *
   * NOT a ceiling. This docblock described `min(inherited, cap)` until 2026-08-21,
   * a model `utils/shop/entry-multiplier.ts` has never implemented — it returns the
   * most specific value unchanged and applies no min() anywhere. The code is
   * authoritative; the comment was the drift. An admin who trusted it would set a
   * "harmless ceiling" of 10 and get a live 10x rate.
   */
  entryMultiplier?: number | null;
  /**
   * Manual catalogue position, ascending. Same field name and same default as
   * `MiniDraw.displayOrder`, deliberately — the two admin panels do the same job.
   *
   * `Date.now()` as the default is what makes an un-dragged product sort LAST:
   * a reorder assigns 1..N, so anything never touched keeps an epoch-sized number
   * and falls below the curated ones. Existing rows are backfilled by
   * `scripts/backfill-product-display-order.ts` so the storefront order does not
   * change on the deploy that adds this field.
   */
  displayOrder: number;
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
  /**
   * One entry per colour the customer can pick, normalised out of `variants`.
   *
   * Apparel is colour x size, and a tee runs to 383 variants — rendering one chip
   * per variant is unusable. The UI picks a colourway first, then a size, so this
   * holds the 51 colours rather than repeating a swatch and an image URL on all
   * 383 rows.
   *
   * `images` are OUR Cloudinary copies, never the provider's URLs: those embed our
   * uid in the path, and the uid is the API key until it is rotated.
   */
  colourways: {
    /** Matches `variants[].colour` exactly — that is the join. */
    name: string;
    /** Swatch colour from the blank catalogue, e.g. "#2c78ac". */
    hex?: string;
    /** Mirrored mockups for this colour, front-most first. */
    images: string[];
  }[];
  /**
   * Provenance for a product synced from the print provider.
   *
   * Deliberately does NOT hold the provider's product id. That id is
   * `"00" + uid + platformProductId`, and the uid IS the API key — storing it
   * would put a live credential in Mongo and, because the product detail page
   * reads the document unprojected, into the page HTML. Only the suffix is kept;
   * `printProviderProductId()` rebuilds the full id server-side when needed.
   */
  printProvider?: {
    /** Blank catalogue id, e.g. "ASAU5001". Not secret. */
    blankProductId?: string;
    /** The provider id with the uid prefix stripped. Not secret on its own. */
    platformProductId?: string;
    syncedAt?: Date;
  };
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
  reviewCount: {
    type: Number,
    default: 0,
    min: [0, 'Review count cannot be negative'],
  },
  displayRating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot be more than 5'],
  },
  displayReviewCount: {
    type: Number,
    default: 0,
    min: [0, 'Review count cannot be negative'],
  },
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
  displayOrder: {
    type: Number,
    default: () => Date.now(),
  },
  entryMultiplier: {
    type: Number,
    default: null,
    min: [SHOP_ENTRY_MULTIPLIER_MIN, 'Entry multiplier cap cannot be below 1'],
    max: [SHOP_ENTRY_MULTIPLIER_MAX, 'Entry multiplier cap cannot exceed 10'],
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
  colourways: [{
    name: { type: String, required: true, trim: true },
    hex: { type: String, trim: true },
    images: [{ type: String, trim: true }],
  }],
  printProvider: {
    blankProductId: { type: String, trim: true },
    platformProductId: { type: String, trim: true },
    syncedAt: { type: Date },
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
ProductSchema.index({ name: 'text', description: 'text', brand: 'text' });
ProductSchema.index({ category: 1 });
// Both the storefront list and the admin list sort on displayOrder now, so it
// needs an index or every catalogue page becomes an in-memory sort.
ProductSchema.index({ displayOrder: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ rating: -1 });
ProductSchema.index({ isActive: 1, isFeatured: 1 });
ProductSchema.index({ tags: 1 });
// Sparse: only synced products carry one, and re-syncing looks the product up by it.
ProductSchema.index({ 'printProvider.platformProductId': 1 }, { sparse: true });

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);