import { Metadata } from "next";
import { Suspense } from "react";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getNonce } from "@/utils/security/getNonce";
import MembershipSection from "@/components/sections/MembershipSection";
import MiniDrawsContent from "@/components/features/MiniDrawsContent";
import { ProductCardSkeleton, Skeleton } from "@/components/loading/SkeletonLoader";
import MiniDrawsHero from "./components/MiniDrawsHero";
import HowMiniDrawsWork from "./components/HowMiniDrawsWork";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mini Draws | Tools Australia",
  description:
    "Purchase mini packs to enter mini draws and go after premium prizes. Only mini pack purchases count toward mini draw entries.",
};

export default async function MiniDrawsPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const nonce = await getNonce();

  return (
    <div className="min-h-screen-svh bg-white dark:bg-neutral-950 w-full overflow-x-hidden">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Mini Draws", item: `${baseUrl}/mini-draws` },
        ]}
        nonce={nonce}
      />

      {/* Hero Section */}
      <MiniDrawsHero />

      {/* Mini Draws Content with Filters */}
      <Suspense
        fallback={
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="hidden lg:block w-80">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 shadow-sm p-6 space-y-4">
                  <Skeleton className="h-6 w-24" />
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              </div>
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

      {/* How It Works Section */}
      <HowMiniDrawsWork />

      {/* Membership Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-0">
        <MembershipSection title="GET MORE ENTRIES WITH MEMBERSHIP" padding="pt-8 pb-32" titleColor="" />
      </div>
    </div>
  );
}
