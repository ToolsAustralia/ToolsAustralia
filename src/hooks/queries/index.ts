/**
 * React Query Hooks Index
 *
 * This file exports all React Query hooks for easy importing throughout the application.
 */

// User hooks
export {
  useUserData,
  useMyAccountData,
  useUserDashboard,
  useUpdateUserProfile,
  useUpdateUserPreferences,
  useCompleteUserSetup,
  useUserStats,
  type UserData,
  type MyAccountData,
  type UpdateUserProfileData,
} from "./useUserQueries";

// Referral hooks
export { useReferralProfile, type ReferralProfile } from "./useReferralQueries";

// Product hooks
export {
  useProducts,
  useInfiniteProducts,
  useProduct,
  useProductSearch,
  useProductCategories,
  useBestsellers,
  useNewArrivals,
  useFeaturedProducts,
  useRelatedProducts,
  useProductAnalytics,
  useProductReviews,
  useAddProductReview,
  useTrackProductView,
  useProductPrefetch,
  type Product,
  type ProductFilters,
  type ProductSearchParams,
  type ProductResponse,
  type ProductCategory,
} from "./useProductQueries";

// Payment method hooks
export {
  usePaymentMethods,
  useDefaultPaymentMethod,
  usePaymentStatus,
  useAddPaymentMethod,
  useDeletePaymentMethod,
  useSetDefaultPaymentMethod,
  usePaymentMethodPrefetch,
  type SavedPaymentMethod,
  type PaymentMethodResponse,
  type AddPaymentMethodData,
  type PaymentStatusResponse,
} from "./usePaymentQueries";

// Cart hooks
export {
  useCart,
  useCartItems,
  useCartSummary,
  useAddToCart,
  useUpdateCartItem,
  useRemoveFromCart,
  useClearCart,
  useCartPrefetch,
  type CartItem,
  type CartSummary,
  type AddToCartData,
  type UpdateCartItemData,
} from "./useCartQueries";

// Membership hooks
export {
  useMembershipPackages,
  useUserMembership,
  useMembershipSubscriptions,
  useOneTimeMemberships,
  usePurchaseMembership,
  useCancelSubscription,
  useReactivateSubscription,
  useUpdateSubscription,
  useMembershipStatus,
  useMembershipPrefetch,
  type MembershipPackage,
  type UserMembership,
  type MembershipSubscription,
  type OneTimeMembership,
  type MembershipPurchaseData,
  type MembershipResponse,
} from "./useMembershipQueries";

// Mini draw hooks
export {
  useMiniDraws,
  useInfiniteMiniDraws,
  useMiniDraw,
  useMiniDrawEntries,
  useMiniDrawResults,
  useUserMiniDrawEntries,
  useEnterMiniDraw,
  useCancelMiniDrawEntry,
  useMiniDrawStats,
  useUserMiniDrawStats,
  useMiniDrawPrefetch,
  type MiniDrawEntry,
  type MiniDrawFilters,
  type MiniDrawResponse,
  type EntryResponse,
  type EntryData,
} from "./useMiniDrawQueries";

// Re-export MiniDraw type from types file
export type { MiniDrawType } from "@/types/mini-draw";

// Order hooks
export {
  useOrders,
  useInfiniteOrders,
  useOrder,
  useRecentOrders,
  useOrderAnalytics,
  useCreateOrder,
  useCancelOrder,
  useUpdateOrderStatus,
  useRequestRefund,
  useOrderStats,
  useOrderPrefetch,
  type Order,
  type OrderItem,
  type OrderFilters,
  type OrderResponse,
  type CreateOrderData,
  type OrderAnalytics,
} from "./useOrderQueries";

// Upsell hooks
export {
  useUpsellOffers,
  useUpsellAnalytics,
  useUpsellTracking,
  useTrackUpsellEvent,
  useAcceptUpsellOffer,
  useDismissUpsellOffer,
  useUpsellManager,
  useUpsellPrefetch,
  type UpsellOffer,
  type UpsellAnalytics,
  type UpsellTrackingData,
  type UpsellOfferParams,
} from "./useUpsellQueries";

// Major draw hooks
export {
  useMajorDraws,
  useCurrentMajorDraw,
  useMajorDrawStats,
  useUserMajorDrawStats,
  useUserMajorDrawEntries,
  useEnterMajorDraw,
  useCancelMajorDrawEntry,
  useMajorDrawCountdown,
  useMajorDrawProgress,
  useMajorDrawPrefetch,
  type MajorDraw,
  type MajorDrawEntry,
  type MajorDrawStats,
  type UserMajorDrawStats,
} from "./useMajorDrawQueries";

// Note: useMiniDrawPackages, usePurchaseMiniDraw and related types are not yet implemented

// Subscription management hooks
export {
  useUpgradeSubscription,
  useRenewSubscription,
  useDowngradeSubscription,
  useCancelSubscription as useCancelSubscriptionMutation,
  useUpdateAutoRenew,
  canRenewSubscription,
  getSubscriptionStatusText,
  getSubscriptionStatusColor,
  type UpgradeSubscriptionData,
  type UpgradeSubscriptionResponse,
  type RenewSubscriptionData,
  type RenewSubscriptionResponse,
  type DowngradeSubscriptionData,
  type DowngradeSubscriptionResponse,
  type CancelSubscriptionData,
  type CancelSubscriptionResponse,
  type UpdateAutoRenewData,
  type UpdateAutoRenewResponse,
} from "./useSubscriptionQueries";

// Query keys and utilities
export { queryKeys } from "@/lib/queryKeys";

// Base API utilities
export {
  apiRequest,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiPatch,
  retryConfig,
  defaultQueryOptions,
  defaultMutationOptions,
  ApiError,
} from "@/lib/queries";
