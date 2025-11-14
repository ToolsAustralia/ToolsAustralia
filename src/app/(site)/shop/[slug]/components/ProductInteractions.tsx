"use client";

import { useState } from "react";
import { ShoppingCart, Minus, Plus } from "lucide-react";
import { ProductData } from "@/data";
import { useCart } from "@/contexts/CartContext";
import { useSession } from "next-auth/react";

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
  const { addToCart, isLoading } = useCart();
  const { data: session } = useSession();

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

      // Handle both ProductData (with id) and database product (with _id)
      const productId = "id" in product ? product.id : product._id;
      await addToCart({
        productId: productId as string,
        quantity,
        price: product.price as number,
        product: {
          _id: productId as string,
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


  const isOutOfStock = product.stock === 0;

  return (
    <div className="space-y-6">
      {/* Stock Status */}
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isOutOfStock ? "bg-red-500" : product.stock && product.stock < 10 ? "bg-orange-500" : "bg-green-500"
          }`}
        ></div>
        <span className="text-sm font-medium text-gray-700">
          {isOutOfStock
            ? "Out of Stock"
            : product.stock && product.stock < 10
            ? `Only ${product.stock} left!`
            : "In Stock"}
        </span>
      </div>

      {/* Quantity Selector */}
      {!isOutOfStock && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Quantity:</span>
          <div className="flex items-center border border-gray-300 rounded-lg">
            <button
              onClick={() => handleQuantityChange(-1)}
              className="p-2 hover:bg-gray-100 transition-colors"
              disabled={quantity <= 1}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 font-medium">{quantity}</span>
            <button
              onClick={() => handleQuantityChange(1)}
              className="p-2 hover:bg-gray-100 transition-colors"
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
          disabled={isOutOfStock || isLoading || isAddingToCart}
          className={`w-full py-2 px-4 sm:py-3 sm:px-6 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-300 flex items-center justify-center gap-1 sm:gap-2 ${
            isOutOfStock || isLoading || isAddingToCart
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : addedToCart
              ? "bg-green-600 text-white"
              : "bg-[#ee0000] text-white hover:bg-[#cc0000] hover:shadow-lg hover:scale-105"
          }`}
        >
          <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
          {isOutOfStock
            ? "Out of Stock"
            : isAddingToCart || isLoading
            ? "Adding..."
            : addedToCart
            ? "Added to Cart!"
            : `Add to Cart - $${(product.price * quantity).toFixed(2)}`}
        </button>
      </div>

      {/* Trust Badges */}
      <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-2 bg-green-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
          </div>
          <div className="text-xs text-gray-600">Free Shipping</div>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
          </div>
          <div className="text-xs text-gray-600">3 Year Warranty</div>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-2 bg-purple-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
          </div>
          <div className="text-xs text-gray-600">30-Day Returns</div>
        </div>
      </div>
    </div>
  );
}
