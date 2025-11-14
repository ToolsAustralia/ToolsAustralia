"use client";

import React, { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, ShoppingCart, Ticket, Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { usePixelTracking } from "@/hooks/usePixelTracking";

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
  prize: {
    name: string;
    value: number;
    images: string[];
  };
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  width: _width = "w-[295px]",
  viewMode = "grid",
}: ProductCardProps) {
  const { items, addToCart, isAddingToCart, isUpdatingCart, hasFailedOperations, retryAllFailedOperations } = useCart();
  const { trackAddToCart, trackViewContent } = usePixelTracking();

  // Local state for immediate UI feedback
  const [localAddedState, setLocalAddedState] = useState<Record<string, boolean>>({});
  const [localLoadingState, setLocalLoadingState] = useState<Record<string, boolean>>({});
  const [localErrorState, setLocalErrorState] = useState<Record<string, boolean>>({});

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

  const getProductData = () => {
    if (isMiniDrawProduct(product)) {
      const remainingEntries = Math.max(
        0,
        product.entriesRemaining !== undefined
          ? product.entriesRemaining
          : product.minimumEntries > 0
          ? product.minimumEntries - product.totalEntries
          : 0
      );
      return {
        id: product._id,
        name: product.name,
        price: getValidPrice(product.prize?.value || 0),
        images: product.prize?.images || [],
        brand: "Mini Draw",
        stock: remainingEntries,
        rating: 4.5,
        isPrize: true,
        endDate: null,
        startDate: null,
        isActive: product.status === "active" && remainingEntries > 0,
        totalEntries: product.totalEntries || 0,
        minimumEntries: product.minimumEntries || 0,
        status: product.status,
        entriesRemaining: remainingEntries,
        requiresMembership: product.requiresMembership ?? true,
        hasActiveMembership: product.hasActiveMembership ?? false,
      };
    } else {
      return {
        id: product._id,
        name: product.name,
        price: getValidPrice(product.price),
        images: product.images,
        brand: product.brand,
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
  }, [productData, addToCart, onAddToCart, product]);

  // Retry failed operation
  const handleRetry = useCallback(async () => {
    setLocalErrorState((prev) => ({ ...prev, [productData.id]: false }));
    await handleAddToCart();
  }, [handleAddToCart, productData.id]);

  // Track view content when product card is rendered
  const handleViewProduct = useCallback(() => {
    trackViewContent({
      value: productData.price,
      currency: "AUD",
      content_type: productData.isPrize ? "prize_draw" : "product",
      content_ids: [productData.id],
      content_name: productData.name,
      content_category: productData.brand,
    });
  }, [productData, trackViewContent]);

  // Track view content on component mount
  React.useEffect(() => {
    handleViewProduct();
  }, [handleViewProduct]);

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
      <div className="bg-white rounded-[20px] sm:rounded-[25px] lg:rounded-[30px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-visible group h-full flex flex-col">
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

          {/* Entries Remaining Badge - Top Center */}
          {productData.isPrize && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-10 whitespace-nowrap group">
              <div className="relative bg-gradient-to-r from-[#ee0000] to-[#cc0000] text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium shadow-lg shadow-[#ee0000]/50 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 opacity-40"></div>
                <span className="relative z-10">
                  {isPrizeCancelled
                    ? "Cancelled"
                    : isPrizeClosed
                    ? "Entries Closed"
                    : `${entriesRemaining ?? 0} entries left`}
                </span>
              </div>
            </div>
          )}

          {/* Mini Draw Progress Bar (Entry-based) */}
          {productData.isPrize && productData.minimumEntries && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white p-2">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span>
                    {productData.totalEntries || 0} / {productData.minimumEntries} entries
                  </span>
                  <span className="text-white/80">
                    {Math.round(((productData.totalEntries || 0) / productData.minimumEntries) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-600 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((productData.totalEntries || 0) / productData.minimumEntries) * 100)}%`,
                    }}
                  />
                </div>
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

            {/* Brand */}
            <p className="text-[12px] sm:text-[14px] lg:text-[16px] text-gray-600 tracking-[0.1px]">
              {productData.brand}
            </p>

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
            <div className="text-[16px] sm:text-[18px] lg:text-[20px] font-bold text-gray-900">
              {productData.isPrize ? (
                <span>Prize: ${productData.price.toFixed(2)}</span>
              ) : (
                <span>${productData.price.toFixed(2)}</span>
              )}
            </div>

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
                  className="w-full py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-[10px] sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 bg-black hover:bg-gray-800 transition-colors"
                >
                  <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5">
                    <Ticket className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                  </div>
                  <span className="hidden sm:inline">
                    {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "View Details" : "Enter Draw"}
                  </span>
                  <span className="sm:hidden">
                    {isPrizeCancelled ? "Cancel" : isPrizeClosed ? "View" : "Enter"}
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
                      : "bg-black hover:bg-gray-800 transition-colors"
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

            {/* Brand */}
            <p className="text-[14px] sm:text-[16px] text-gray-600 tracking-[0.1px]">{productData.brand}</p>

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
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-700">
                    {productData.totalEntries || 0} / {productData.minimumEntries} entries
                  </span>
                  <span className="text-gray-500">
                    {Math.round(((productData.totalEntries || 0) / productData.minimumEntries) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-600 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((productData.totalEntries || 0) / productData.minimumEntries) * 100)}%`,
                    }}
                  />
                </div>
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
            <div className="text-[16px] sm:text-[18px] lg:text-[20px] font-bold text-gray-900">
              {productData.isPrize ? (
                <span>Prize: ${productData.price.toFixed(2)}</span>
              ) : (
                <span>${productData.price.toFixed(2)}</span>
              )}
            </div>

            {/* Add to Cart Button with optimistic feedback */}
            {productData.isPrize ? (
              // For mini draws, redirect to detail page
              <Link
                href={`/mini-draws/${productData.id}`}
                className="px-4 sm:px-8 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-colors"
              >
                <div className="w-4 h-4 sm:w-5 sm:h-5">
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="hidden sm:inline">
                  {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "View Details" : "Enter Draw"}
                </span>
                <span className="sm:hidden">
                  {isPrizeCancelled ? "Cancel" : isPrizeClosed ? "View" : "Enter"}
                </span>
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
