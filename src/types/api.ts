// API Response Types
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartItemWithProduct extends CartItem {
  product?: {
    _id: string;
    name: string;
    price: number;
    description?: string;
    images?: string[];
    stock: number;
  };
}

export interface CartResponse {
  cart: CartItemWithProduct[];
  subtotal: number;
  itemCount: number;
}

// Product Types
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
  products: unknown[];
  total: number;
  page: number;
  totalPages: number;
}

// Order Types
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface CreateOrderData {
  items: OrderItem[];
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentMethod: string;
}

// Membership Types
export interface MembershipData {
  name: string;
  description: string;
  price: number;
  duration: number;
  entries: number;
  points: number;
  features: string[];
  isActive: boolean;
}

// Giveaway Types
export interface GiveawayData {
  title: string;
  description: string;
  prize: string;
  startDate: Date;
  endDate: Date;
  maxEntries: number;
  isActive: boolean;
  image?: string;
}
