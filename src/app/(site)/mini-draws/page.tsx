import { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { Package, Ticket, Trophy } from "lucide-react";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getNonce } from "@/utils/security/getNonce";
import MembershipSection from "@/components/sections/MembershipSection";
import MiniDrawsContent from "@/components/features/MiniDrawsContent";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { ProductCardSkeleton, Skeleton } from "@/components/loading/SkeletonLoader";

export const metadata: Metadata = {
  title: "Mini Draws | Tools Australia",
  description:
    "Purchase mini packs to enter mini draws and go after premium prizes. Only mini pack purchases count toward mini draw entries.",
};

export default async function MiniDrawsPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

  // Get CSP nonce from request headers (set by middleware in production)
  const nonce = await getNonce();

  return (
    <div className="min-h-screen-svh bg-white">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Mini Draws", item: `${baseUrl}/mini-draws` },
        ]}
        nonce={nonce}
      />
      {/* Page Header - Metallic Industrial Design */}
      <div className="relative pt-[86px] sm:pt-[106px] pb-8 bg-gradient-to-b from-black via-slate-900 to-black">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/background/miniDrawPage-bg.webp"
            alt="Tools Australia"
            fill
            className="object-cover "
            priority
            unoptimized
          />
          <div className="absolute inset-0 " />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="text-center lg:text-left">
              <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-['Poppins'] mb-4">
                <span className="text-white">Mini </span>
                <span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">D</span>
                <span className="text-white">raws</span>
              </h1>
            </div>
            <div className="text-center lg:text-right lg:max-w-md">
              <p className="text-[16px] text-gray-200">
                Enter exciting mini draws to win amazing tools, equipment, and accessories worth thousands of dollars!
              </p>
            </div>
          </div>
        </div>

        {/* Metallic Border */}
        <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
      </div>

      {/* Mini Draws Content with Filters */}
      <Suspense
        fallback={
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Filters Skeleton - Desktop */}
              <div className="hidden lg:block w-80">
                <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                  <Skeleton className="h-6 w-24" />
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Products Grid Skeleton */}
              <div className="flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {[...Array(6)].map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        }
      >
        <MiniDrawsContent initialMiniDraws={[]} totalMiniDraws={0} />
      </Suspense>

      {/* How It Works Section - matches draw-results "How Winners Are Selected" layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200/50 px-6 py-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-['Poppins'] mb-3">
              How Mini Draws Work
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Purchase a mini pack, join active draws, and check the results when we announce winners.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center group">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform duration-300 shadow-lg">
                <Package className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 font-['Poppins']">Purchase a Mini Pack</h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                Buy a mini pack to get entries in active mini draws.
              </p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform duration-300 shadow-lg">
                <Ticket className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 font-['Poppins']">Join Mini Draws</h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                Browse active draws and purchase the entry packages that suit your goals.
              </p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform duration-300 shadow-lg">
                <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 font-['Poppins']">Track Winners</h3>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                Check the <a href="/draw-results" className="text-red-600 hover:underline">results page</a> to see who took home the prize.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Membership Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MembershipSection title="GET MORE ENTRIES WITH MEMBERSHIP" padding="pt-8 pb-32" titleColor="" />
      </div>
    </div>
  );
}
