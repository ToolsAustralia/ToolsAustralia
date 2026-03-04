"use client";

import React, { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, ShoppingCart, Ticket, Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { getBrandMeta, defaultBrandLogo } from "@/utils/brand-utils";
import type { BrandLogo } from "@/data/brandLogos";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import { useUserContext } from "@/contexts/UserContext";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";

// Types
interface ProductItem {
  _id: string;
  name: string;
  price: number;
  images: string[];
  brand: string;
  stock: number;
  reviews?: number;
  rating?: number;
}

interface MiniDrawType {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining?: number;
  isActive?: boolean;
  requiresMembership: boolean;
  hasActiveMembership?: boolean;
  brandId?: string;
  userEntryCount?: number; // User's entry count in this specific minidraw
  prize: {
    name: string;
    value: number;
    images: string[];
  };
}

interface NormalizedProductData {
  id: string;
  name: string;
  price: number;
  images: string[];
  brand: string;
  brandAccent: {
    label: string;
    logo: string;
    overlayScale: number;
    hasBrand: boolean;
    brandData: BrandLogo;
    gradientOverride?: string | null;
  } | null;
  stock: number | null;
  rating: number;
  isPrize: boolean;
  endDate: Date | null;
  startDate: Date | null;
  isActive: boolean;
  totalEntries: number | null;
  minimumEntries: number | null;
  status: MiniDrawType["status"] | null;
  entriesRemaining: number | null;
  requiresMembership: boolean;
  hasActiveMembership: boolean;
}

type ProductCardProps = {
  product: ProductItem | MiniDrawType;
  onAddToCart?: (product: ProductItem | MiniDrawType) => void;
  width?: string;
  viewMode?: "grid" | "list";
};

export default function ProductCard({
  product,
  onAddToCart,
  width: _width = "w-[295px]",
  viewMode = "grid",
}: ProductCardProps) {
  const { items, addToCart, isAddingToCart, isUpdatingCart, hasFailedOperations, retryAllFailedOperations } = useCart();
  const { trackAddToCart } = usePixelTracking();
  const { trackAddToCart: trackKlaviyoAddToCart } = useKlaviyoTracking();
  const { userData, isAuthenticated } = useUserContext();

  // Helper functions
  const getValidRating = (rating: unknown): number => {
    if (typeof rating === "number" && !isNaN(rating)) {
      return Math.max(0, Math.min(5, rating));
    }
    return 4.0;
  };

  const getValidPrice = (price: unknown): number => {
    if (typeof price === "number" && !isNaN(price) && price >= 0) {
      return price;
    }
    return 0;
  };

  const isMiniDrawProduct = (item: ProductItem | MiniDrawType): item is MiniDrawType => {
    // Check for mini draw specific properties (entry-based system)
    return "prize" in item && "status" in item && "minimumEntries" in item;
  };

  // Check if this is a minidraw product
  const isMiniDraw = isMiniDrawProduct(product);

  // Subscribe to minidraw query updates for real-time UI updates
  const { data: miniDrawQueryData } = useMiniDraw(isMiniDraw ? product._id : undefined);

  // Local state for immediate UI feedback
  const [localAddedState, setLocalAddedState] = useState<Record<string, boolean>>({});
  const [localLoadingState, setLocalLoadingState] = useState<Record<string, boolean>>({});
  const [localErrorState, setLocalErrorState] = useState<Record<string, boolean>>({});

  /**
   * Calculate user's entry count for this specific minidraw.
   * Mini draw eligibility is package-only: only purchased mini pack entries count (no member entries).
   */
  const getUserEntryCount = (): number => {
    if (!isMiniDraw || !isAuthenticated || !userData) return 0;

    const currentMiniDrawId = String(product._id || "");

    const userWithParticipation = userData as unknown as {
      miniDrawParticipation?: Array<{
        miniDrawId: string | { toString(): string } | { _id: string | { toString(): string } };
        totalEntries: number;
        isActive?: boolean;
      }>;
    };

    const participationEntry = userWithParticipation?.miniDrawParticipation?.find((p) => {
      const pkgMiniDrawId = p.miniDrawId;
      if (typeof pkgMiniDrawId === "string") {
        return pkgMiniDrawId === currentMiniDrawId;
      }
      if (pkgMiniDrawId && typeof pkgMiniDrawId === "object") {
        if ("toString" in pkgMiniDrawId && typeof pkgMiniDrawId.toString === "function") {
          return pkgMiniDrawId.toString() === currentMiniDrawId;
        }
        if ("_id" in pkgMiniDrawId) {
          const idValue = (pkgMiniDrawId as { _id: unknown })._id;
          if (typeof idValue === "string") {
            return idValue === currentMiniDrawId;
          }
          if (idValue && typeof idValue === "object" && "toString" in idValue) {
            return (idValue as { toString: () => string }).toString() === currentMiniDrawId;
          }
        }
      }
      return false;
    });

    if (participationEntry && participationEntry.totalEntries > 0) {
      return participationEntry.totalEntries;
    }

    const userMiniDrawPackages = (
      userData as {
        miniDrawPackages?: Array<{
          isActive: boolean;
          miniDrawId?: string | { toString(): string };
          entriesGranted?: number;
        }>;
      }
    ).miniDrawPackages;
    const activeMiniDrawPackageEntries =
      userMiniDrawPackages?.reduce((sum, pkg) => {
        if (!pkg.isActive) return sum;
        const pkgMiniDrawId = pkg.miniDrawId
          ? typeof pkg.miniDrawId === "string"
            ? pkg.miniDrawId
            : pkg.miniDrawId.toString()
          : null;
        if (pkgMiniDrawId && pkgMiniDrawId === currentMiniDrawId) {
          return sum + (pkg.entriesGranted || 0);
        }
        return sum;
      }, 0) || 0;

    return activeMiniDrawPackageEntries;
  };

  const getProductData = (): NormalizedProductData => {
    if (isMiniDrawProduct(product)) {
      // Use query data if available (for real-time updates), otherwise fall back to product prop
      const totalEntries = miniDrawQueryData?.totalEntries ?? product.totalEntries ?? 0;
      const minimumEntries = miniDrawQueryData?.minimumEntries ?? product.minimumEntries ?? 0;
      const entriesRemainingData = miniDrawQueryData?.entriesRemaining ?? product.entriesRemaining;

      const remainingEntries = Math.max(
        0,
        entriesRemainingData !== undefined
          ? entriesRemainingData
          : minimumEntries > 0
          ? minimumEntries - totalEntries
          : 0
      );
      const brandMeta = getBrandMeta(product.brandId);
      const brandData = brandMeta ?? defaultBrandLogo;
      const brandLabel = brandData.name;
      const brandLogo = brandData.logo;
      // Use the overlay scale (not the image scale) so badge dimensions stay consistent across brands.
      const overlayScale = brandMeta?.overlayScale ?? defaultBrandLogo.overlayScale ?? 1;
      const gradientOverride = brandMeta ? undefined : "bg-transparent";

      return {
        id: product._id,
        name: product.name,
        price: getValidPrice(product.prize?.value || 0),
        images: product.prize?.images || [],
        brand: brandLabel,
        brandAccent: {
          label: brandLabel,
          logo: brandLogo,
          overlayScale,
          hasBrand: Boolean(brandMeta),
          brandData,
          gradientOverride,
        },
        stock: remainingEntries,
        rating: 4.5,
        isPrize: true,
        endDate: null,
        startDate: null,
        isActive: product.status === "active" && remainingEntries > 0,
        totalEntries,
        minimumEntries,
        status: product.status,
        entriesRemaining: remainingEntries,
        requiresMembership: product.requiresMembership ?? false, // ✅ AUTHENTICATION-ONLY: Mini draws default to false
        hasActiveMembership: product.hasActiveMembership ?? false,
      };
    } else {
      return {
        id: product._id,
        name: product.name,
        price: getValidPrice(product.price),
        images: product.images,
        brand: product.brand,
        brandAccent: null,
        stock: product.stock,
        rating: getValidRating(product.rating),
        isPrize: false,
        endDate: null,
        startDate: null,
        isActive: true,
        totalEntries: null,
        minimumEntries: null,
        status: null,
        entriesRemaining: null,
        requiresMembership: false,
        hasActiveMembership: false,
      };
    }
  };

  const productData = getProductData();
  const brandAccent = productData.brandAccent;

  // Check if product is in cart (immediate local check)
  const isInCart = items.some((item) => item.productId === productData.id) || localAddedState[productData.id];
  const hasError = localErrorState[productData.id];

  // Optimistic add to cart handler with comprehensive error handling
  const handleAddToCart = useCallback(async () => {
    // Clear any previous error state
    setLocalErrorState((prev) => ({ ...prev, [productData.id]: false }));

    // Immediate UI feedback - optimistic update
    setLocalLoadingState((prev) => ({ ...prev, [productData.id]: true }));
    setLocalAddedState((prev) => ({ ...prev, [productData.id]: true }));

    try {
      // Optimistic cart update (UI updates immediately, API call happens in background)
      await addToCart({
        productId: isMiniDrawProduct(product) ? undefined : productData.id,
        miniDrawId: isMiniDrawProduct(product) ? productData.id : undefined,
        quantity: 1,
        price: productData.price,
        product: isMiniDrawProduct(product)
          ? undefined
          : {
              _id: product._id,
              name: product.name,
              price: product.price,
              images: product.images,
              brand: product.brand,
              stock: product.stock,
            },
        miniDraw: isMiniDrawProduct(product)
          ? {
              _id: product._id,
              name: product.name,
              ticketPrice: productData.price, // Use prize value as price for cart compatibility
              totalTickets: product.minimumEntries || 0, // Use minimumEntries for cart compatibility
              soldTickets: product.totalEntries || 0, // Use totalEntries for cart compatibility
              prize: product.prize,
            }
          : undefined,
      });

      // Track pixel events for add to cart
      trackAddToCart({
        value: productData.price,
        currency: "AUD",
        content_type: productData.isPrize ? "prize_draw" : "product",
        content_ids: [productData.id],
        content_name: productData.name,
        content_category: productData.brand,
        num_items: 1,
      });

      // Track Klaviyo add to cart event
      trackKlaviyoAddToCart({
        value: productData.price,
        currency: "AUD",
        productId: productData.id,
        productName: productData.name,
        numItems: 1,
      });

      // Call legacy callback if provided
      if (onAddToCart) {
        onAddToCart(product);
      }
    } catch (error) {
      // If optimistic update fails, show error state
      setLocalErrorState((prev) => ({ ...prev, [productData.id]: true }));
      setLocalAddedState((prev) => ({ ...prev, [productData.id]: false }));
      console.error("Failed to add to cart:", error);
    } finally {
      // Clear loading state after a brief moment
      setTimeout(() => {
        setLocalLoadingState((prev) => ({ ...prev, [productData.id]: false }));
      }, 300);
    }
  }, [productData, addToCart, onAddToCart, product, trackAddToCart, trackKlaviyoAddToCart]);

  // Retry failed operation
  const handleRetry = useCallback(async () => {
    setLocalErrorState((prev) => ({ ...prev, [productData.id]: false }));
    await handleAddToCart();
  }, [handleAddToCart, productData.id]);

  // NOTE: ViewContent tracking removed from ProductCard component mount
  // ViewContent should only fire on product detail pages, not on card renders
  // This prevents noise (was firing 37.4K events vs 3.1K PageView)
  // Function kept commented for potential future use (e.g., click tracking)
  // const handleViewProduct = useCallback(() => {
  //   trackViewContent({
  //     value: productData.price,
  //     currency: "AUD",
  //     content_type: productData.isPrize ? "prize_draw" : "product",
  //     content_ids: [productData.id],
  //     content_name: productData.name,
  //     content_category: productData.brand,
  //   });
  // }, [productData, trackViewContent]);

  const renderStars = (rating: number) => {
    const validRating = getValidRating(rating);
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < Math.floor(validRating) ? "text-yellow-400 fill-current" : "text-gray-300"}`}
      />
    ));
  };

  const isOutOfStock = productData.stock === 0;
  const miniDrawStatus = productData.isPrize ? (productData.status as MiniDrawType["status"] | null) : null;
  const entriesRemaining = productData.isPrize ? productData.entriesRemaining ?? 0 : null;
  const isPrizeCancelled = productData.isPrize && miniDrawStatus === "cancelled";
  const isPrizeClosed =
    productData.isPrize && (miniDrawStatus === "completed" || (entriesRemaining !== null && entriesRemaining <= 0));

  // Check loading states
  const isCurrentlyLoading =
    localLoadingState[productData.id] || isAddingToCart(productData.id) || isUpdatingCart(productData.id);

  // Grid view
  if (viewMode === "grid") {
    return (
      <div className="bg-white rounded-[20px] sm:rounded-[25px] lg:rounded-[30px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden group h-full flex flex-col">
        <div className="relative">
          {/* Product Image */}
          <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
            <div className="relative w-full h-[200px] sm:h-[220px] lg:h-[240px] overflow-hidden">
              <Image
                src={productData.images[0] || "/images/placeholder.jpg"}
                alt={productData.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 200px, (max-width: 1024px) 220px, 240px"
              />
            </div>
          </Link>

          {/* Brand Overlay */}
          {productData.isPrize && brandAccent && (
            <div className="absolute bottom-12 right-2 z-10">
              <BrandLogoCard
                brand={brandAccent.brandData}
                overlayMode="overlay"
                gradientOverride={brandAccent.gradientOverride ?? undefined}
                scaleOverride={brandAccent.overlayScale}
                widthClass="w-auto"
                heightClass="h-auto"
              />
            </div>
          )}

          {/* Your Entries Badge - Top Center (only shows if user has entries) */}
          {productData.isPrize && isAuthenticated && getUserEntryCount() > 0 && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-10 whitespace-nowrap">
              <div className="relative bg-gradient-to-r from-green-500 to-green-600 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium shadow-lg shadow-green-500/50 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 opacity-40"></div>
                <span className="relative z-10 flex items-center gap-1">
                  <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  Your Entries: {getUserEntryCount()}
                </span>
              </div>
            </div>
          )}

          {/* Mini Draw Entry Display */}
          {productData.isPrize && productData.minimumEntries && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white p-2">
              <div className="flex justify-center items-center text-xs">
                <span>{productData.entriesRemaining || 0} entries remaining</span>
              </div>
            </div>
          )}

          {/* Error indicator */}
          {hasError && (
            <div className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 lg:p-5 flex flex-col h-full">
          {/* Product Info Section - Flexible content */}
          <div className="flex-1 space-y-2">
            {/* Product Name */}
            <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
              <h3 className="text-[14px] sm:text-[16px] lg:text-[18px] font-bold text-gray-900 hover:text-blue-600 transition-colors line-clamp-2 min-h-[2.5rem]">
                {productData.name}
              </h3>
            </Link>

            {/* Brand (products only) */}
            {!productData.isPrize && (
              <p className="text-[12px] sm:text-[14px] lg:text-[16px] text-gray-600 tracking-[0.1px]">
                {productData.brand}
              </p>
            )}

            {/* Rating - Only show for products, not mini draws */}
            {!productData.isPrize && (
              <div className="flex items-center gap-1">
                <div className="flex items-center">{renderStars(productData.rating)}</div>
                <span className="text-[12px] sm:text-[14px] text-gray-600 ml-1">
                  ({getValidRating(productData.rating).toFixed(1)})
                </span>
              </div>
            )}

            {/* Stock Status for Products */}
            {!productData.isPrize && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOutOfStock ? "bg-red-500" : "bg-green-500"}`} />
                <span className="text-[12px] sm:text-[14px] text-gray-600">
                  {isOutOfStock ? "Out of Stock" : "In Stock"}
                </span>
              </div>
            )}

            {/* Mini Draw Status */}
            {productData.isPrize && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isPrizeCancelled ? "bg-red-500" : isPrizeClosed ? "bg-yellow-500" : "bg-green-500"
                  }`}
                />
                <span className="text-[12px] sm:text-[14px] text-gray-600">
                  {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "Closed" : "Active"}
                </span>
              </div>
            )}

            {/* Error message */}
            {hasError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Failed to add to cart</span>
              </div>
            )}
          </div>

          {/* Price and Button Section - Fixed at bottom */}
          <div className="mt-4 space-y-3">
            {/* Price */}
            {!productData.isPrize && (
              <div className="text-[16px] sm:text-[18px] lg:text-[20px] font-bold text-gray-900">
                <span>${productData.price.toFixed(2)}</span>
              </div>
            )}

            {/* Add to Cart Button - Optimistic with Error Handling */}
            <div>
              {hasError ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleRetry}
                    className="flex-1 py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-[10px] sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 bg-red-600 hover:bg-red-700"
                  >
                    <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    <span className="hidden sm:inline">Retry</span>
                    <span className="sm:hidden">Retry</span>
                  </button>
                  {hasFailedOperations && (
                    <button
                      onClick={retryAllFailedOperations}
                      className="px-3 py-2 sm:py-2.5 lg:py-3 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-[10px] sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] bg-orange-600 hover:bg-orange-700 transition-all duration-200"
                      title="Retry all failed operations"
                    >
                      <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    </button>
                  )}
                </div>
              ) : productData.isPrize ? (
                // For mini draws, redirect to detail page
                <Link
                  href={`/mini-draws/${productData.id}`}
                  className="w-full py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-[10px] sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 bg-black hover:bg-gray-800"
                >
                  <span className="text-[9px] sm:text-[10px] lg:text-xs font-semibold">$1</span>
                  <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5">
                    <Ticket className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                  </div>
                  <span className="hidden sm:inline">
                    {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "View Details" : "Enter Draw"}
                  </span>
                  <span className="sm:hidden">
                    {isPrizeCancelled ? "Cancel" : isPrizeClosed ? "View" : "Enter Draw"}
                  </span>
                </Link>
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock || isInCart || isCurrentlyLoading}
                  className={`w-full py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-[10px] sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 ${
                    isOutOfStock || isInCart || isCurrentlyLoading
                      ? isInCart
                        ? "bg-green-600 cursor-not-allowed"
                        : isCurrentlyLoading
                        ? "bg-blue-600 cursor-not-allowed animate-pulse"
                        : "bg-gray-400 cursor-not-allowed"
                      : "bg-black hover:bg-gray-800"
                  }`}
                >
                  <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5">
                    {isCurrentlyLoading ? (
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 animate-spin" />
                    ) : isInCart ? (
                      <Check className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    ) : (
                      <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    )}
                  </div>
                  <span className="hidden sm:inline">
                    {isCurrentlyLoading
                      ? "Adding..."
                      : isInCart
                      ? "Added to Cart"
                      : isOutOfStock
                      ? "Sold Out"
                      : "Add to Cart"}
                  </span>
                  <span className="sm:hidden">
                    {isCurrentlyLoading ? "Adding..." : isInCart ? "Added" : isOutOfStock ? "Sold Out" : "Add"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view (similar optimistic approach)
  return (
    <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden">
      <div className="flex">
        {/* Product Image */}
        <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
          <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0">
            <Image
              src={productData.images[0] || "/images/placeholder.jpg"}
              alt={productData.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 96px, 128px"
            />
            {productData.isPrize && brandAccent && (
              <div className="absolute bottom-1 right-1 z-10">
                <BrandLogoCard
                  brand={brandAccent.brandData}
                  overlayMode="overlay"
                  gradientOverride={brandAccent.gradientOverride ?? undefined}
                  scaleOverride={brandAccent.overlayScale}
                  widthClass="w-auto"
                  heightClass="h-auto"
                />
              </div>
            )}
            {/* Error indicator for list view */}
            {hasError && (
              <div className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 p-4 flex flex-col justify-between">
          <div className="space-y-2">
            {/* Product Name */}
            <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
              <h3 className="text-[14px] sm:text-[16px] lg:text-[18px] font-bold text-gray-900 hover:text-blue-600 transition-colors line-clamp-2">
                {productData.name}
              </h3>
            </Link>

            {/* Brand (products only) */}
            {!productData.isPrize && (
              <p className="text-[14px] sm:text-[16px] text-gray-600 tracking-[0.1px]">{productData.brand}</p>
            )}

            {/* Rating - Only show for products, not mini draws */}
            {!productData.isPrize && (
              <div className="flex items-center gap-1">
                <div className="flex items-center">{renderStars(productData.rating)}</div>
                <span className="text-[14px] text-gray-600 ml-1">
                  ({getValidRating(productData.rating).toFixed(1)})
                </span>
              </div>
            )}

            {/* Stock Status for Products */}
            {!productData.isPrize && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOutOfStock ? "bg-red-500" : "bg-green-500"}`} />
                <span className="text-[12px] sm:text-[14px] text-gray-600">
                  {isOutOfStock ? "Out of Stock" : "In Stock"}
                </span>
              </div>
            )}

            {/* Mini Draw Progress Bar (Entry-based) - List View */}
            {productData.isPrize && productData.minimumEntries && (
              <div className="flex justify-center items-center text-xs">
                <span className="text-gray-700">{productData.entriesRemaining || 0} entries remaining</span>
              </div>
            )}

            {/* Error message for list view */}
            {hasError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Failed to add to cart</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            {/* Price */}
            {!productData.isPrize && (
              <div className="text-[16px] sm:text-[18px] lg:text-[20px] font-bold text-gray-900">
                <span>${productData.price.toFixed(2)}</span>
              </div>
            )}

            {/* Add to Cart Button with optimistic feedback */}
            {productData.isPrize ? (
              // For mini draws, redirect to detail page
              <Link
                href={`/mini-draws/${productData.id}`}
                className="px-4 sm:px-8 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
              >
                <span className="text-[10px] sm:text-xs font-semibold">$1</span>
                <div className="w-4 h-4 sm:w-5 sm:h-5">
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="hidden sm:inline">
                  {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "View Details" : "Enter Draw"}
                </span>
                <span className="sm:hidden">{isPrizeCancelled ? "Cancel" : isPrizeClosed ? "View" : "Enter Draw"}</span>
              </Link>
            ) : hasError ? (
              <div className="flex gap-2">
                <button
                  onClick={handleRetry}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 bg-red-600 hover:bg-red-700"
                >
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Retry</span>
                  <span className="sm:hidden">Retry</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock || isInCart || isCurrentlyLoading}
                className={`px-4 sm:px-8 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 ${
                  isOutOfStock || isInCart || isCurrentlyLoading
                    ? isInCart
                      ? "bg-green-600 cursor-not-allowed"
                      : isCurrentlyLoading
                      ? "bg-blue-600 cursor-not-allowed animate-pulse"
                      : "bg-gray-400 cursor-not-allowed"
                    : "bg-black hover:bg-gray-800 transition-colors"
                }`}
              >
                <div className="w-4 h-4 sm:w-5 sm:h-5">
                  {isCurrentlyLoading ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : isInCart ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </div>
                <span className="hidden sm:inline">
                  {isCurrentlyLoading
                    ? "Adding..."
                    : isInCart
                    ? "Added to Cart"
                    : isOutOfStock
                    ? "Sold Out"
                    : "Add to Cart"}
                </span>
                <span className="sm:hidden">
                  {isCurrentlyLoading ? "Adding..." : isInCart ? "Added" : isOutOfStock ? "Sold Out" : "Add"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
