"use client";

import { useMemo, useState } from "react";
import { ShoppingCart, Minus, Plus } from "lucide-react";
import { ProductData } from "@/data";
import { useCart } from "@/contexts/CartContext";
import { useSession } from "next-auth/react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { useUserContext } from "@/contexts/UserContext";
import {
  activeVariants,
  variantLabel,
  isVariantPurchasable,
  type ProductVariantLike,
} from "@/utils/shop/variants";

interface DatabaseProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  brand: string;
  [key: string]: unknown;
}

interface ProductInteractionsProps {
  product: ProductData | DatabaseProduct;
}

export default function ProductInteractions({ product }: ProductInteractionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const { addToCart, isAddingToCart: isProductAdding } = useCart();
  const { data: session } = useSession();
  const { trackAddToCart } = usePixelTracking();
  const { trackAddToCart: trackKlaviyoAddToCart } = useKlaviyoTracking();
  const { isAuthenticated: _isAuthenticated } = useUserContext();
  const productIdValue = ("id" in product ? product.id : product._id) as string;
  const isPendingForThisProduct = isProductAdding(productIdValue);

  // Variants are the purchasable unit for apparel. A product with none behaves
  // exactly as before, so the existing tool catalog is unaffected.
  //
  // `product` is a union of the DB shape and the legacy static `ProductData`,
  // and only the former carries these fields. One narrow cast here beats
  // widening the union or sprinkling `any`.
  const fields = product as unknown as {
    trackInventory?: boolean;
    variants?: ProductVariantLike[];
    isActive?: boolean;
  };
  const trackInventory = fields.trackInventory ?? true;
  const rawVariants = fields.variants;
  const options = useMemo<ProductVariantLike[]>(
    () => activeVariants({ variants: rawVariants ?? [] }),
    [rawVariants]
  );
  const hasVariants = options.length > 0;

  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const selectedVariant = options.find((v) => v.sku === selectedSku) ?? null;

  const variantHost = {
    isActive: fields.isActive ?? true,
    trackInventory,
    stock: product.stock ?? 0,
    variants: options,
  };

  const canAddSelected = hasVariants
    ? Boolean(selectedVariant) && isVariantPurchasable(variantHost, selectedVariant!)
    : !trackInventory || (product.stock ?? 0) > 0;

  const handleQuantityChange = (change: number) => {
    setQuantity(Math.max(1, Math.min(product.stock || 999, quantity + change)));
  };

  const handleAddToCart = async () => {
    if (!session?.user?.id) {
      alert("Please log in to add items to cart");
      return;
    }

    try {
      setIsAddingToCart(true);

      // Track AddToCart event (standard Meta Pixel event)
      // This replaces the non-standard ButtonClick event with the official AddToCart event
      trackAddToCart({
        value: (product.price as number) * quantity,
        currency: "AUD",
        productId: productIdValue,
      });

      // Track Klaviyo add to cart event
      trackKlaviyoAddToCart({
        value: (product.price as number) * quantity,
        currency: "AUD",
        product_id: productIdValue,
        product_name: product.name,
        num_items: quantity,
      });

      await addToCart({
        productId: productIdValue,
        sku: selectedSku ?? undefined,
        quantity,
        price: product.price as number,
        product: {
          _id: productIdValue,
          name: product.name,
          price: product.price as number,
          images: Array.isArray(product.images) ? product.images : [],
          brand: product.brand || "Unknown",
          stock: product.stock || 0,
        },
      });

      // Show success state
      setAddedToCart(true);

      // Reset success state after 2 seconds
      setTimeout(() => {
        setAddedToCart(false);
      }, 2000);

      console.log(`Added ${quantity} of ${product.name} to cart`);
    } catch (error) {
      console.error("Error adding to cart:", error);
      alert("Failed to add item to cart. Please try again.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Print-to-order items carry stock 0 forever, so stock must not read as
  // "out of stock" for them — the printer makes each one on demand.
  const isOutOfStock = trackInventory && product.stock === 0;

  return (
    <div className="space-y-6">
      {/* Stock Status */}
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isOutOfStock ? "bg-red-500" : trackInventory && product.stock && product.stock < 10 ? "bg-orange-500" : "bg-green-500"
          }`}
        ></div>
        <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
          {isOutOfStock
            ? "Out of Stock"
            : !trackInventory
            ? "Made to order"
            : product.stock && product.stock < 10
            ? `Only ${product.stock} left!`
            : "In Stock"}
        </span>
      </div>

      {/* Variant picker — apparel is size x colour, so this is what the customer
          actually chooses and what the printer is told to make. */}
      {hasVariants && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
            Choose an option:
          </span>
          <div className="flex flex-wrap gap-2">
            {options.map((variant) => {
              const available = isVariantPurchasable(variantHost, variant);
              const isSelected = variant.sku === selectedSku;
              return (
                <button
                  key={variant.sku}
                  type="button"
                  onClick={() => setSelectedSku(variant.sku)}
                  disabled={!available}
                  aria-pressed={isSelected}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-red-600 bg-red-600 text-white"
                      : available
                      ? "border-gray-300 bg-white text-gray-800 hover:border-red-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-500"
                  }`}
                >
                  {variantLabel(variant)}
                </button>
              );
            })}
          </div>
          {!selectedSku && (
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Pick an option to continue.
            </p>
          )}
        </div>
      )}

      {/* Quantity Selector */}
      {!isOutOfStock && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">Quantity:</span>
          <div className="flex items-center border border-gray-300 dark:border-neutral-700 rounded-lg">
            <button
              onClick={() => handleQuantityChange(-1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              disabled={quantity <= 1}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 font-medium">{quantity}</span>
            <button
              onClick={() => handleQuantityChange(1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              disabled={quantity >= (product.stock || 999)}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 sm:gap-4">
        <button
          onClick={handleAddToCart}
          disabled={!canAddSelected || isAddingToCart || isPendingForThisProduct}
          className={`w-full py-2 px-4 sm:py-3 sm:px-6 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-300 flex items-center justify-center gap-1 sm:gap-2 ${
            !canAddSelected || isAddingToCart || isPendingForThisProduct
              ? "bg-gray-300 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400 cursor-not-allowed"
              : addedToCart
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white hover:bg-red-675 hover:shadow-lg hover:scale-105"
          }`}
        >
          <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
          {isOutOfStock
            ? "Out of Stock"
            : /* Say why the button is dead rather than leaving it silently inert. */
            hasVariants && !selectedSku
            ? "Choose an option"
            : isAddingToCart || isPendingForThisProduct
            ? "Adding..."
            : addedToCart
            ? "Added to Cart!"
            : `Add to Cart - $${(product.price * quantity).toFixed(2)}`}
        </button>
      </div>

      {/* Trust Badges */}
      <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200 dark:border-neutral-800">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-2 bg-green-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
          </div>
          <div className="text-xs text-gray-600 dark:text-neutral-400">Free Shipping</div>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
          </div>
          <div className="text-xs text-gray-600 dark:text-neutral-400">3 Year Warranty</div>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-2 bg-purple-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
          </div>
          <div className="text-xs text-gray-600 dark:text-neutral-400">30-Day Returns</div>
        </div>
      </div>
    </div>
  );
}
