"use client";

import { useState, useEffect } from "react";
import ProductSection from "@/components/features/ProductSection";
import { Product } from "@/types/product";

interface HomeProductsProps {
  sectionType: "bestsellers" | "newarrivals" | "featured";
  title: string;
}

export default function HomeProducts({ sectionType, title }: HomeProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch products from API
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build query parameters directly inside useEffect
        const baseParams = new URLSearchParams();
        baseParams.append("limit", "4");

        switch (sectionType) {
          case "bestsellers":
            baseParams.append("sortBy", "rating");
            baseParams.append("sortOrder", "desc");
            break;
          case "newarrivals":
            baseParams.append("sortBy", "createdAt");
            baseParams.append("sortOrder", "desc");
            break;
          case "featured":
            baseParams.append("featured", "true");
            break;
        }

        const queryParams = baseParams.toString();
        const response = await fetch(`/api/products?${queryParams}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch ${sectionType}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products);
          console.log(`📦 ${title} loaded:`, data.products.length, "products");
        } else {
          console.warn(`⚠️ Unexpected response format for ${title}:`, data);
          setProducts([]);
        }
      } catch (err) {
        console.error(`❌ Error fetching ${title}:`, err);
        setError(`Failed to load ${title.toLowerCase()}`);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [sectionType, title]);

  if (loading) {
    return (
      <section className="py-12 sm:py-16 lg:py-20 bg-white w-full overflow-hidden">
        <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
          <div className="text-center">
            <div className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">{title}</div>
            <div className="text-gray-500">Loading products...</div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-12 sm:py-16 lg:py-20 bg-white w-full overflow-hidden">
        <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
          <div className="text-center">
            <div className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">{title}</div>
            <div className="text-red-500">{error}</div>
          </div>
        </div>
      </section>
    );
  }

  // Hide section completely if no products are found
  if (products.length === 0) {
    return null;
  }

  return <ProductSection title={title} products={products} showViewAll={true} />;
}
