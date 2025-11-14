"use client";

import Link from "next/link";
import ProductCard from "../ui/ProductCard";

// Use the same types as ProductCard to avoid conflicts
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

// Union type for both product types (same as in ProductCard)
type ProductItemUnion = ProductItem | MiniDrawType;

interface ProductSectionProps {
  title: string;
  products: ProductItemUnion[];
  showViewAll?: boolean;
  viewAllLink?: string;
  onAddToCart?: (product: ProductItemUnion) => void;
  className?: string;
}

export default function ProductSection({
  title,
  products,
  showViewAll = true,
  viewAllLink = "/shop",
  onAddToCart,
  className = "",
}: ProductSectionProps) {
  return (
    <section className={`py-12 sm:py-16 lg:py-20 bg-white w-full overflow-hidden ${className}`}>
      <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
        {/* Section Header - Mobile/Tablet: Title only */}
        <div className="lg:hidden text-center mb-6 sm:mb-8">
          <h2 className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins'] leading-tight">
            {title}
          </h2>
        </div>

        {/* Section Header - Desktop: Title and View All button */}
        <div className="hidden lg:flex flex-row items-center justify-between mb-16">
          <h2 className="text-[32px] font-bold text-black font-['Poppins'] leading-tight">{title}</h2>

          {showViewAll && (
            <Link
              href={viewAllLink}
              className="inline-flex items-center justify-center px-[54px] py-4 border-2 border-black text-black font-medium text-[16px] rounded-[62px] hover:bg-black hover:text-white transition-colors duration-200 w-[218px] h-[52px] font-['Inter:Medium',_sans-serif]"
            >
              View All
            </Link>
          )}
        </div>

        {/* Products Grid - Mobile/Tablet: 2 columns */}
        <div className="lg:hidden grid grid-cols-2 gap-2 sm:gap-3 justify-items-center mb-6 sm:mb-8">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} />
          ))}
        </div>

        {/* Products Grid - Desktop: Original layout */}
        <div className="hidden lg:grid grid-cols-3 xl:grid-cols-4 gap-8 justify-items-center">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} />
          ))}
        </div>

        {/* View All Button - Mobile/Tablet: Bottom centered */}
        {showViewAll && (
          <div className="lg:hidden flex justify-center mt-4 sm:mt-6">
            <Link
              href={viewAllLink}
              className="inline-flex items-center justify-center px-8 sm:px-12 py-3 sm:py-4 border-2 border-black text-black font-medium text-[14px] sm:text-[16px] rounded-[62px] hover:bg-black hover:text-white transition-colors duration-200 w-auto h-[44px] sm:h-[48px] font-['Inter:Medium',_sans-serif]"
            >
              View All
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
