import Link from "next/link";
import { Package } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function ProductNotFound() {
  return (
    <div className="min-h-screen-svh bg-white">
      <Header />
      <div className="pt-24 flex flex-col items-center justify-center min-h-[60svh] text-center">
        <Package className="h-16 w-16 text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 dark:text-neutral-100 mb-2">Product Not Found</h1>
        <p className="text-gray-600 dark:text-neutral-400 mb-6">
          The product you&apos;re looking for doesn&apos;t exist or may have been removed.
        </p>
        <div className="flex gap-4">
          <Link
            href="/shop"
            className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-675 transition-colors"
          >
            Browse All Products
          </Link>
          <Link
            href="/"
            className="border border-gray-300 text-gray-700 dark:text-neutral-200 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
