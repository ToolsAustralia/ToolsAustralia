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
