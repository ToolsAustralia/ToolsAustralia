import { Skeleton } from "@/components/loading/SkeletonLoader";

/**
 * Loading state for product detail page
 * Displays skeleton loaders matching the page layout for better perceived performance
 */
export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen-svh bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column - Product Image Skeleton */}
          <div className="space-y-4">
            <Skeleton className="aspect-square w-full rounded-2xl" />
          </div>

          {/* Right Column - Product Info Skeleton */}
          <div className="space-y-6">
            {/* Brand & Name Skeleton */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <Skeleton className="h-10 w-3/4" />
            </div>

            {/* Rating & Reviews Skeleton */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-5 w-5 rounded" />
                ))}
                <Skeleton className="h-4 w-12 ml-2" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>

            {/* Price Skeleton */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>

            {/* Description Skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            {/* Interactive Components Skeleton */}
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>

        {/* Product Tabs Skeleton */}
        <div className="mt-8 space-y-4">
          <div className="flex gap-4 border-b">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-24" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

