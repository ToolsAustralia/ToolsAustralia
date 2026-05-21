import { Skeleton } from "@/components/loading/SkeletonLoader";

export default function MiniDrawDetailLoading() {
  return (
    <div className="min-h-screen-svh bg-gray-50 dark:bg-neutral-950">
      {/* Hero Banner Skeleton */}
      <div className="pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] pb-8 sm:pb-12 bg-gradient-to-b from-black via-slate-900 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 pt-4 pb-5 sm:pb-8">
            <Skeleton className="h-4 w-10 bg-white/10" />
            <Skeleton className="h-3 w-3 bg-white/5" />
            <Skeleton className="h-4 w-20 bg-white/10" />
            <Skeleton className="h-3 w-3 bg-white/5" />
            <Skeleton className="h-4 w-32 bg-white/10" />
          </div>
          {/* Brand + Status */}
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
            <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
          </div>
          {/* Title */}
          <Skeleton className="h-8 sm:h-10 w-3/4 bg-white/10 mb-4" />
          {/* Progress bar */}
          <div className="max-w-md space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-32 bg-white/10" />
              <Skeleton className="h-3 w-20 bg-white/10" />
            </div>
            <Skeleton className="h-2 w-full rounded-full bg-white/10" />
          </div>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-gray-700 to-transparent mt-8 sm:mt-12" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* Left Column - Image Gallery Skeleton */}
          <div className="space-y-3">
            <Skeleton className="aspect-square lg:aspect-[4/3] w-full rounded-2xl" />
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl" />
              ))}
            </div>
          </div>

          {/* Right Column (packages first on mobile) */}
          <div className="flex flex-col gap-5">
            {/* Purchase section — red accent bar + package grid */}
            <div className="order-first lg:order-2 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 shadow-lg overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-red-600 via-red-400 to-red-600" />
              <div className="p-3 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-14 sm:h-16 rounded-lg" />
                  ))}
                </div>
                <div className="pt-3 border-t border-gray-100 flex items-center justify-center gap-6">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>

            {/* Description — collapsible on mobile */}
            <div className="order-2 lg:order-1 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-6 w-6 rounded-full bg-gray-100 dark:bg-neutral-800 lg:hidden" />
              </div>
              <div className="hidden lg:block space-y-2 mt-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Skeleton — collapsed on mobile, full tabs on desktop */}
        <div className="mt-10 sm:mt-14">
          {/* Mobile: collapsed bar */}
          <div className="lg:hidden bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-6 rounded-full bg-gray-100" />
          </div>
          {/* Desktop: 2-tab layout */}
          <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex border-b border-gray-100 px-6">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex-1 py-4 flex items-center justify-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
            <div className="p-6 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Related Draws Skeleton */}
        <section className="mt-14">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 shadow-sm overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-gray-200 dark:bg-neutral-800" />
                <div className="p-3 sm:p-4 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-16" />
                  <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-3/4" />
                  <div className="h-1.5 bg-gray-200 dark:bg-neutral-800 rounded-full w-full" />
                  <div className="h-9 bg-gray-200 dark:bg-neutral-800 rounded-full w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
