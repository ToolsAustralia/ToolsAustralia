import { Metadata } from "next";
import CheckoutPageClient from "./components/CheckoutPageClient";
import CustomerTestimonials from "@/components/sections/CustomerTestimonials";
import ProductSection from "@/components/features/ProductSection";
import MembershipSection from "@/components/sections/MembershipSection";
// Using real API endpoints for products and mini draws
async function getProductsAndMiniDraws() {
  try {
    // Skip API calls during build time to prevent timeouts
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_APP_URL) {
      return {
        products: [],
        miniDraws: [],
      };
    }

    // Use absolute URL for build-time compatibility
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Add timeout to prevent build hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const [productsRes, miniDrawsRes] = await Promise.all([
      fetch(`${baseUrl}/api/products`, { signal: controller.signal }),
      fetch(`${baseUrl}/api/mini-draws`, { signal: controller.signal }),
    ]);

    clearTimeout(timeoutId);

    const products = productsRes.ok ? await productsRes.json() : { data: [] };
    const miniDraws = miniDrawsRes.ok ? await miniDrawsRes.json() : { miniDraws: [] };

    return {
      products: products.data || [],
      miniDraws: miniDraws.miniDraws || [],
    };
  } catch (error) {
    console.error("Error fetching products and mini draws:", error);
    return {
      products: [],
      miniDraws: [],
    };
  }
}

export const metadata: Metadata = {
  title: "Checkout | Tools Australia",
  description:
    "Complete your order securely with our fast and reliable checkout process. Multiple payment options available.",
  keywords: "checkout, secure payment, tools australia, order completion",
};

export default async function CheckoutPage() {
  const { products, miniDraws } = await getProductsAndMiniDraws();

  return (
    <div className="min-h-screen-svh bg-gray-50">
      <CheckoutPageClient />

      {/* Customer Testimonials Section */}
      {/* <CustomerTestimonials /> */}

      {/* Related Products Section */}
      <ProductSection
        title="Complete Your Toolkit"
        products={products.slice(0, 4)}
        showViewAll={true}
        viewAllLink="/shop"
      />

      {/* Mini Draws Section */}
      <ProductSection
        title="Enter Mini Draws"
        products={miniDraws.slice(0, 4)}
        showViewAll={true}
        viewAllLink="/mini-draws"
      />

      {/* Membership Section */}
      <MembershipSection title="UNLOCK EXCLUSIVE MEMBER BENEFITS" padding="py-8 sm:py-12 lg:pb-16 mb-16" />
    </div>
  );
}
