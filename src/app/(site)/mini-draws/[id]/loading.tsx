import { Skeleton } from "@/components/loading/SkeletonLoader";

/**
 * Loading state for mini-draws detail page
 * Displays skeleton loaders matching the page layout for better perceived performance
 */
export default function MiniDrawDetailLoading() {
  return (
    <div className="min-h-screen-svh bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column - Images Skeleton */}
          <div className="space-y-4">
            {/* Main Image Gallery Skeleton */}
            <Skeleton className="h-[400px] sm:h-[500px] w-full rounded-lg" />
            
            {/* Countdown Timer Skeleton */}
            <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl shadow-xl border border-white/20 p-6">
              <div className="space-y-4">
                <Skeleton className="h-6 w-32 bg-white/20" />
                <div className="grid grid-cols-4 gap-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
                      <Skeleton className="h-8 w-full mb-2 bg-white/20" />
                      <Skeleton className="h-4 w-full bg-white/20" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Details Skeleton */}
          <div className="space-y-6">
            {/* Status Badges Skeleton */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>

            {/* Title Skeleton */}
            <Skeleton className="h-10 w-3/4" />

            {/* Prize Value Skeleton */}
            <div className="flex items-center gap-3 flex-wrap">
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-20 rounded" />
            </div>

            {/* Entry Information Skeleton */}
            <Skeleton className="h-4 w-48" />

            {/* Description Skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            {/* Interactions Skeleton */}
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>

        {/* Tabs Skeleton */}
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

        {/* Related Mini Draws Skeleton */}
        <section className="mt-16">
          <div className="flex items-center justify-between mb-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-[25px] shadow-[0px_4px_10px_0px_rgba(0,0,0,0.1)] p-4 sm:p-6 animate-pulse">
                <Skeleton className="h-[150px] sm:h-[196px] rounded-[10px] mb-4" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

