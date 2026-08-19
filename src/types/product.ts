// Product Types
export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  brand: string;
  stock: number;
  rating: number;
  reviews: number; // Number of reviews
  features: string[];
  specifications: Record<string, string>;
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
  slug: string;
  /**
   * Free entries included with one unit of this product — a free inclusion with
   * the item, never sold and never priced per unit (CLAUDE.md rule 11).
   *
   * This is the BASE count. What a customer actually receives is
   * `includedEntries × quantity × the current one-time promo multiplier`, so any
   * surface rendering it must apply the multiplier too or it understates the
   * offer during a promo.
   *
   * `0` (the default) means the product includes no entries and the promise must
   * not be rendered at all.
   */
  includedEntries?: number;
  /**
   * `false` for print-to-order items, which hold `stock: 0` permanently because the
   * printer makes each one on demand. Anything reading stock to decide availability
   * MUST check this first, or the whole made-to-order catalogue reads as sold out.
   */
  trackInventory?: boolean;
  /**
   * One entry per colour the customer can pick, normalised out of `variants` so a
   * 383-variant garment carries 51 swatches rather than repeating an image URL on
   * every row. `name` joins to `variants[].colour`.
   *
   * `images` are always our own Cloudinary copies — the print provider's mockup
   * URLs contain the account uid and must never reach a browser.
   */
  colourways?: {
    name: string;
    hex?: string;
    images?: string[];
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductFormData {
  name: string;
  description: string;
  price: number;
  images: File[];
  uploadedImageUrls: string[];
  category: string;
  brand: string;
  stock: number;
  features: string[];
  specifications: Record<string, string>;
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
}

export interface ProductSearchParams {
  query?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ProductSearchResult {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}
