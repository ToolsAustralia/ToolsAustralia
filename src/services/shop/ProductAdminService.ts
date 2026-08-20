import Product, { type IProduct } from "@/models/Product";

export interface ProductVariantInput {
  sku: string;
  size?: string;
  colour?: string;
  gtin?: string;
  isActive?: boolean;
}

export interface ProductArtworkInput {
  url: string;
  placement: string;
  type: "printing" | "mockup";
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  brand: string;
  variants: ProductVariantInput[];
  includedEntries?: number;
  /** Ceiling on the promo multiplier for this product. null = fall through. */
  entryMultiplierCap?: number | null;
  printArtwork?: ProductArtworkInput[];
  trackInventory?: boolean;
  stock?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  tags?: string[];
  originLocation?: string;
}

/**
 * Admin-side catalog operations.
 *
 * The public `/api/products/**` family has no single-product create or update
 * route — only a bulk import and a duplicate. These are the paths the admin UI
 * uses, and they are the only ones that write a single product.
 */
export const ProductAdminService = {
  /**
   * Newest first, capped. The admin table is not paginated yet; the cap stops a
   * grown catalog from shipping an unbounded payload the way an unprojected
   * list once did elsewhere in this repo.
   */
  async list(limit = 200): Promise<IProduct[]> {
    // displayOrder first so the admin list mirrors the storefront exactly — an
    // admin dragging a card must see the order a customer will see. createdAt
    // breaks ties for rows that share a position.
    return Product.find({}).sort({ displayOrder: 1, createdAt: -1 }).limit(limit);
  },

  async create(input: ProductInput): Promise<IProduct> {
    return Product.create(input);
  },

  async update(id: string, input: Partial<ProductInput>): Promise<IProduct | null> {
    return Product.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  },

  async setActive(id: string, isActive: boolean): Promise<IProduct | null> {
    return Product.findByIdAndUpdate(id, { isActive }, { new: true });
  },

  async remove(id: string): Promise<boolean> {
    const removed = await Product.findByIdAndDelete(id);
    return removed !== null;
  },
};
