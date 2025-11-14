/**
 * Product-related React Query hooks
 *
 * This file contains all hooks for product data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost } from "@/lib/queries";

// Types
export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  brand: string;
  category: string;
  subcategory?: string;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  rating: number;
  reviewCount: number;
  specifications: Record<string, unknown>;
  features: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductFilters extends Record<string, unknown> {
  category?: string[];
  brand?: string[];
  priceRange?: [number, number];
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ProductSearchParams {
  search: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ProductResponse {
  products: Product[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
  };
}

export interface ProductCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  productCount: number;
  subcategories?: ProductCategory[];
}

// Hooks
export const useProducts = (filters: ProductFilters = {}) => {
  return useQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item) => params.append(key, String(item)));
          } else {
            params.append(key, String(value));
          }
        }
      });

      const response = await apiGet<ProductResponse>(`/api/products?${params.toString()}`);
      return response;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    placeholderData: keepPreviousData, // Keep previous data while fetching new data
  });
};

export const useInfiniteProducts = (filters: ProductFilters = {}) => {
  return useInfiniteQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item) => params.append(key, String(item)));
          } else {
            params.append(key, String(value));
          }
        }
      });

      params.append("page", String(pageParam));
      params.append("limit", "12");

      const response = await apiGet<ProductResponse>(`/api/products?${params.toString()}`);
      return response;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasNextPage ? lastPage.pagination.currentPage + 1 : undefined;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useProduct = (productId?: string) => {
  return useQuery({
    queryKey: queryKeys.products.detail(productId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Product }>(`/api/products/${productId}`);
      return response.data;
    },
    enabled: !!productId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useProductSearch = (searchParams: ProductSearchParams) => {
  return useQuery({
    queryKey: queryKeys.products.search(searchParams.search),
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });

      const response = await apiGet<ProductResponse>(`/api/products/search?${params.toString()}`);
      return response;
    },
    enabled: !!searchParams.search && searchParams.search.length > 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useProductCategories = () => {
  return useQuery({
    queryKey: queryKeys.products.categories,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: ProductCategory[] }>("/api/products/categories");
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

export const useBestsellers = (limit: number = 8) => {
  return useQuery({
    queryKey: queryKeys.products.bestsellers,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Product[] }>(`/api/products/bestsellers?limit=${limit}`);
      return response.data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

export const useNewArrivals = (limit: number = 8) => {
  return useQuery({
    queryKey: queryKeys.products.newarrivals,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Product[] }>(`/api/products/newarrivals?limit=${limit}`);
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useFeaturedProducts = (limit: number = 8) => {
  return useQuery({
    queryKey: queryKeys.products.featured,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Product[] }>(`/api/products/featured?limit=${limit}`);
      return response.data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

export const useRelatedProducts = (productId?: string, limit: number = 4) => {
  return useQuery({
    queryKey: queryKeys.products.related(productId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Product[] }>(
        `/api/products/related/${productId}?limit=${limit}`
      );
      return response.data;
    },
    enabled: !!productId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

export const useProductAnalytics = (productId?: string) => {
  return useQuery({
    queryKey: queryKeys.products.analytics(productId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: unknown }>(`/api/products/analytics/${productId}`);
      return response.data;
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};

export const useProductReviews = (productId?: string) => {
  return useQuery({
    queryKey: queryKeys.products.reviews(productId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: unknown[] }>(`/api/products/reviews/${productId}`);
      return response.data;
    },
    enabled: !!productId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

// Mutations
export const useAddProductReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, review }: { productId: string; review: unknown }) => {
      const response = await apiPost<{ success: boolean; data: unknown }>(`/api/products/reviews/${productId}`, review);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate product reviews
      queryClient.invalidateQueries({ queryKey: queryKeys.products.reviews(variables.productId) });

      // Update product rating in cache
      queryClient.setQueryData(queryKeys.products.detail(variables.productId), (old: unknown) => {
        if (old && typeof old === "object" && data && typeof data === "object") {
          return {
            ...old,
            rating: (data as { rating: number }).rating,
            reviewCount: (data as { reviewCount: number }).reviewCount,
          };
        }
        return old;
      });
    },
  });
};

export const useTrackProductView = () => {
  return useMutation({
    mutationFn: async (productId: string) => {
      await apiPost(`/api/products/analytics/${productId}/view`, {});
    },
    retry: 1, // Don't retry analytics calls
  });
};

// Utility hooks
export const useProductPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchProduct = (productId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.products.detail(productId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: Product }>(`/api/products/${productId}`);
        return response.data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };

  const prefetchRelatedProducts = (productId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.products.related(productId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: Product[] }>(`/api/products/related/${productId}`);
        return response.data;
      },
      staleTime: 15 * 60 * 1000,
    });
  };

  return { prefetchProduct, prefetchRelatedProducts };
};