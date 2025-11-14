/**
 * Prefetching Utilities
 *
 * This file contains utilities for prefetching data to improve user experience.
 */

import { useQueryClient } from "@tanstack/react-query";
import {
  useProductPrefetch,
  // useProductCategories, // TODO: Implement product categories prefetching
  // useBestsellers, // TODO: Implement bestsellers prefetching
  // useNewArrivals, // TODO: Implement new arrivals prefetching
  // useFeaturedProducts, // TODO: Implement featured products prefetching
  useMembershipPrefetch,
  usePaymentMethodPrefetch,
  useCartPrefetch,
  useMiniDrawPrefetch,
  useMajorDrawPrefetch,
  useOrderPrefetch,
  useUpsellPrefetch,
} from "./queries";

/**
 * Hook for prefetching commonly used data
 */
export const usePrefetching = () => {
  const queryClient = useQueryClient();

  // Get prefetch functions from individual hooks
  const { prefetchProduct, prefetchRelatedProducts } = useProductPrefetch();
  const { prefetchMembershipPackages, prefetchUserMembership } = useMembershipPrefetch();
  const { prefetchPaymentMethods } = usePaymentMethodPrefetch();
  const { prefetchCart } = useCartPrefetch();
  const { prefetchMiniDraw, prefetchMiniDrawEntries } = useMiniDrawPrefetch();
  const { prefetchCurrentMajorDraw, prefetchUserStats } = useMajorDrawPrefetch();
  const { prefetchOrder, prefetchRecentOrders } = useOrderPrefetch();
  const { prefetchUpsellOffers } = useUpsellPrefetch();

  /**
   * Prefetch essential data for the home page
   */
  const prefetchHomePageData = async (userId?: string) => {
    try {
      // Prefetch product categories
      await queryClient.prefetchQuery({
        queryKey: ["products", "categories"],
        queryFn: async () => {
          const response = await fetch("/api/products/categories");
          const result = await response.json();
          return result.data;
        },
        staleTime: 30 * 60 * 1000, // 30 minutes
      });

      // Prefetch bestsellers
      await queryClient.prefetchQuery({
        queryKey: ["products", "bestsellers"],
        queryFn: async () => {
          const response = await fetch("/api/products/bestsellers?limit=8");
          const result = await response.json();
          return result.data;
        },
        staleTime: 15 * 60 * 1000, // 15 minutes
      });

      // Prefetch new arrivals
      await queryClient.prefetchQuery({
        queryKey: ["products", "newarrivals"],
        queryFn: async () => {
          const response = await fetch("/api/products/newarrivals?limit=8");
          const result = await response.json();
          return result.data;
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
      });

      // Prefetch featured products
      await queryClient.prefetchQuery({
        queryKey: ["products", "featured"],
        queryFn: async () => {
          const response = await fetch("/api/products/featured?limit=8");
          const result = await response.json();
          return result.data;
        },
        staleTime: 15 * 60 * 1000, // 15 minutes
      });

      // Prefetch current major draw
      await queryClient.prefetchQuery({
        queryKey: ["major-draw", "current"],
        queryFn: async () => {
          const response = await fetch("/api/major-draw");
          const result = await response.json();
          return result.data.majorDraw;
        },
        staleTime: 1 * 60 * 1000, // 1 minute
      });

      // Prefetch membership packages
      await queryClient.prefetchQuery({
        queryKey: ["memberships", "packages"],
        queryFn: async () => {
          const response = await fetch("/api/memberships/packages");
          const result = await response.json();
          return result.data;
        },
        staleTime: 30 * 60 * 1000, // 30 minutes
      });

      // If user is logged in, prefetch user-specific data
      if (userId) {
        await Promise.all([
          prefetchUserMembership(userId),
          prefetchPaymentMethods(userId),
          prefetchCart(userId),
          prefetchUserStats(userId),
        ]);
      }
    } catch (error) {
      console.error("Error prefetching home page data:", error);
    }
  };

  /**
   * Prefetch data for the shop page
   */
  const prefetchShopPageData = async (filters: Record<string, unknown> = {}) => {
    try {
      // Prefetch product categories
      await queryClient.prefetchQuery({
        queryKey: ["products", "categories"],
        queryFn: async () => {
          const response = await fetch("/api/products/categories");
          const result = await response.json();
          return result.data;
        },
        staleTime: 30 * 60 * 1000,
      });

      // Prefetch products with filters
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item) => params.append(key, String(item)));
          } else {
            params.append(key, String(value));
          }
        }
      });

      await queryClient.prefetchQuery({
        queryKey: ["products", "list", filters],
        queryFn: async () => {
          const response = await fetch(`/api/products?${params.toString()}`);
          const result = await response.json();
          return result;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    } catch (error) {
      console.error("Error prefetching shop page data:", error);
    }
  };

  /**
   * Prefetch data for a product detail page
   */
  const prefetchProductPageData = async (productId: string, userId?: string) => {
    try {
      await Promise.all([prefetchProduct(productId), prefetchRelatedProducts(productId)]);

      // If user is logged in, prefetch user-specific data
      if (userId) {
        await Promise.all([prefetchCart(userId), prefetchPaymentMethods(userId)]);
      }
    } catch (error) {
      console.error("Error prefetching product page data:", error);
    }
  };

  /**
   * Prefetch data for the checkout page
   */
  const prefetchCheckoutPageData = async (userId: string) => {
    try {
      await Promise.all([prefetchCart(userId), prefetchPaymentMethods(userId), prefetchUserMembership(userId)]);
    } catch (error) {
      console.error("Error prefetching checkout page data:", error);
    }
  };

  /**
   * Prefetch data for the membership page
   */
  const prefetchMembershipPageData = async (userId?: string) => {
    try {
      await prefetchMembershipPackages();

      if (userId) {
        await Promise.all([prefetchUserMembership(userId), prefetchPaymentMethods(userId)]);
      }
    } catch (error) {
      console.error("Error prefetching membership page data:", error);
    }
  };

  /**
   * Prefetch data for the mini draw page
   */
  const prefetchMiniDrawPageData = async (userId?: string) => {
    try {
      // Prefetch active mini draws
      await queryClient.prefetchQuery({
        queryKey: ["mini-draws", "list", { status: "active" }],
        queryFn: async () => {
          const response = await fetch("/api/mini-draws?status=active");
          const result = await response.json();
          return result;
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
      });

      if (userId) {
        await Promise.all([
          prefetchUserStats(userId),
          // Prefetch user's mini draw entries
          queryClient.prefetchQuery({
            queryKey: ["mini-draws", "user-entries", userId],
            queryFn: async () => {
              const response = await fetch("/api/mini-draws/user-entries");
              const result = await response.json();
              return result.data;
            },
            staleTime: 1 * 60 * 1000,
          }),
        ]);
      }
    } catch (error) {
      console.error("Error prefetching mini draw page data:", error);
    }
  };

  /**
   * Prefetch data for the user dashboard
   */
  const prefetchDashboardData = async (userId: string) => {
    try {
      await Promise.all([
        prefetchUserMembership(userId),
        prefetchUserStats(userId),
        prefetchRecentOrders(userId),
        prefetchCart(userId),
        prefetchPaymentMethods(userId),
      ]);
    } catch (error) {
      console.error("Error prefetching dashboard data:", error);
    }
  };

  return {
    prefetchHomePageData,
    prefetchShopPageData,
    prefetchProductPageData,
    prefetchCheckoutPageData,
    prefetchMembershipPageData,
    prefetchMiniDrawPageData,
    prefetchDashboardData,
    // Individual prefetch functions
    prefetchProduct,
    prefetchRelatedProducts,
    prefetchMembershipPackages,
    prefetchUserMembership,
    prefetchPaymentMethods,
    prefetchCart,
    prefetchMiniDraw,
    prefetchMiniDrawEntries,
    prefetchCurrentMajorDraw,
    prefetchUserStats,
    prefetchOrder,
    prefetchRecentOrders,
    prefetchUpsellOffers,
  };
};
